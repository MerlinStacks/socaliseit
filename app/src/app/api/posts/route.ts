/**
 * Posts API Routes
 * CRUD operations for posts with real database integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { schedulePost, publishNow } from '@/lib/queue';
import { logger } from '@/lib/logger';
import { cleanupConflictingAiDrafts } from '@/lib/ai/draft-generator';


/**
 * GET /api/posts - List posts for current workspace
 * Query params: status, platform, limit, offset
 */
export async function GET(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build where clause based on filters
    const where: Record<string, unknown> = { organizationId };
    if (status && status !== 'all') {
        where.status = status.toUpperCase();
    }

    const [posts, total] = await Promise.all([
        db.post.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
            include: {
                pillar: { select: { id: true, name: true, color: true } },
                platforms: {
                    include: {
                        socialAccount: {
                            select: { id: true, platform: true, name: true, avatar: true }
                        }
                    }
                },
                media: {
                    include: {
                        media: { select: { id: true, url: true, thumbnailUrl: true, mimeType: true } }
                    },
                    orderBy: { order: 'asc' }
                },
                hashtags: {
                    include: {
                        hashtag: { select: { id: true, tag: true } }
                    }
                }
            }
        }),
        db.post.count({ where })
    ]);

    // Transform posts for frontend consumption
    const transformedPosts = posts.map(post => ({
        id: post.id,
        caption: post.caption,
        status: post.status.toLowerCase(),
        scheduledAt: post.scheduledAt?.toISOString() || null,
        publishedAt: post.publishedAt?.toISOString() || null,
        createdAt: post.createdAt.toISOString(),
        pillar: post.pillar ? { id: post.pillar.id, name: post.pillar.name, color: post.pillar.color } : null,
        platforms: post.platforms.map(pp => ({
            id: pp.socialAccount.platform.toLowerCase(),
            name: pp.socialAccount.name,
            avatar: pp.socialAccount.avatar
        })),
        media: post.media.map(pm => ({
            id: pm.media.id,
            url: pm.media.url,
            thumbnailUrl: pm.media.thumbnailUrl,
            type: pm.media.mimeType.startsWith('video/') ? 'video' : 'image'
        })),
        hashtags: post.hashtags.map(ph => ph.hashtag.tag)
    }));

    return NextResponse.json({
        posts: transformedPosts,
        total,
        limit,
        offset,
    });
}

/**
 * POST /api/posts - Create new posts
 * 
 * NEW ARCHITECTURE: Creates one Post record per platform.
 * Multi-platform posts share a linkedGroupId but each post is independent.
 * Why: Enables editing/rescheduling individual platform posts independently.
 */
export async function POST(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;
    const userId = session.user.id;
    const userName = session.user.name || 'Unknown';

    const body = await request.json();
    const {
        caption,
        platformAccountIds,
        mediaIds,
        scheduledAt,
        pillarId,
        hashtags,
        autoPublish,
        firstComment,
        platformSettings, // { [accountId]: { postType, callToAction, caption, mediaIds, firstComment } }
    } = body;

    // Type for platform settings input
    type PlatformSettingsInput = {
        postType?: string;
        callToAction?: string;
        caption?: string;
        mediaIds?: string[];
        firstComment?: string;
    };
    const parsedPlatformSettings: Record<string, PlatformSettingsInput> =
        platformSettings && typeof platformSettings === 'object' ? platformSettings : {};


    // Determine if ALL platforms are stories (stories don't require captions)
    const allPlatformsAreStories = platformAccountIds.every((accountId: string) => {
        const settings = parsedPlatformSettings[accountId] || {};
        return settings.postType?.toUpperCase() === 'STORY';
    });

    // Validate required fields (caption only required for non-story posts)
    if (!allPlatformsAreStories && (!caption || typeof caption !== 'string' || caption.trim() === '')) {
        return NextResponse.json({ error: 'Caption is required' }, { status: 400 });
    }

    if (!platformAccountIds || !Array.isArray(platformAccountIds) || platformAccountIds.length === 0) {
        return NextResponse.json({ error: 'At least one platform account is required' }, { status: 400 });
    }

    // Fetch social accounts to get platform info
    const socialAccounts = await db.socialAccount.findMany({
        where: {
            id: { in: platformAccountIds },
            organizationId,
        },
        select: { id: true, platform: true },
    });

    if (socialAccounts.length !== platformAccountIds.length) {
        return NextResponse.json({ error: 'One or more platform accounts not found' }, { status: 400 });
    }

    // Pre-create hashtag records
    let hashtagRecords: { id: string }[] = [];
    if (hashtags?.length) {
        hashtagRecords = await Promise.all(
            hashtags.map(async (tag: string) => {
                const hashtag = await db.hashtag.upsert({
                    where: { tag: tag.toLowerCase().replace('#', '') },
                    update: { usageCount: { increment: 1 } },
                    create: { tag: tag.toLowerCase().replace('#', '') }
                });
                return { id: hashtag.id };
            })
        );
    }

    // Generate linkedGroupId for multi-platform posts
    // Why: Links posts created together while keeping them independent
    const linkedGroupId = platformAccountIds.length > 1
        ? `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
        : null;

    // Create one Post per platform (NEW ARCHITECTURE)
    const createdPosts = await Promise.all(
        socialAccounts.map(async (account) => {
            const settings = parsedPlatformSettings[account.id] || {};
            const postCaption = settings.caption || caption || '';
            const postFirstComment = settings.firstComment || firstComment || null;
            const postMediaIds = settings.mediaIds || mediaIds || [];

            const post = await db.post.create({
                data: {
                    organizationId,
                    caption: postCaption,
                    status: scheduledAt ? 'SCHEDULED' : 'DRAFT',
                    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
                    autoPublish: autoPublish === true,
                    firstComment: postFirstComment,
                    pillarId: pillarId || null,
                    // NEW: Direct platform fields
                    platform: account.platform,
                    socialAccountId: account.id,
                    postType: (settings.postType?.toUpperCase() as 'FEED' | 'REEL' | 'STORY' | 'CAROUSEL' | 'PIN' | 'VIDEO' | 'ARTICLE' | 'THREAD') || 'FEED',
                    callToAction: settings.callToAction || null,
                    customMediaIds: postMediaIds,
                    linkedGroupId,
                    // Media relations
                    media: postMediaIds.length ? {
                        create: postMediaIds.map((mediaId: string, index: number) => ({
                            mediaId,
                            order: index
                        }))
                    } : undefined,
                    // Hashtag relations
                    hashtags: hashtagRecords.length ? {
                        create: hashtagRecords.map(h => ({ hashtagId: h.id }))
                    } : undefined,
                },
                include: {
                    pillar: true,
                    socialAccount: true,
                    media: { include: { media: true } }
                }
            });

            return post;
        })
    );

    // Log activity for each post
    for (const post of createdPosts) {
        await db.activity.create({
            data: {
                organizationId,
                userId,
                userName,
                action: scheduledAt ? 'scheduled' : 'created',
                resourceType: 'post',
                resourceId: post.id,
                resourceName: (post.caption || '').slice(0, 50) + ((post.caption || '').length > 50 ? '...' : ''),
                details: scheduledAt
                    ? `Scheduled for ${new Date(scheduledAt).toLocaleString()} (${post.platform})`
                    : undefined
            }
        });
    }

    // Queue each post for publishing
    for (const post of createdPosts) {
        try {
            if (autoPublish === true) {
                const result = await publishNow(post.id, organizationId);
                logger.info({ postId: post.id, jobId: result.jobId }, 'Post queued for immediate publishing');
            } else if (scheduledAt) {
                const result = await schedulePost(post.id, organizationId, {
                    datetime: new Date(scheduledAt),
                    timezone: 'UTC',
                    platforms: [post.socialAccountId!],
                });
                logger.info({ postId: post.id, jobId: result.jobId, scheduledAt: result.scheduledAt }, 'Post scheduled for publishing');
            }
        } catch (queueError) {
            logger.error({ postId: post.id, error: queueError }, 'Failed to queue post for publishing');
        }
    }

    // Cleanup conflicting AI drafts
    if (scheduledAt) {
        for (const post of createdPosts) {
            try {
                if (post.platform) {
                    await cleanupConflictingAiDrafts(
                        organizationId,
                        new Date(scheduledAt),
                        post.platform
                    );
                }
            } catch (cleanupError) {
                logger.warn({ postId: post.id, error: cleanupError }, 'Failed to cleanup AI drafts');
            }
        }
    }

    // Return all created posts
    return NextResponse.json({
        posts: createdPosts.map(post => ({
            id: post.id,
            caption: post.caption,
            status: post.status.toLowerCase(),
            scheduledAt: post.scheduledAt?.toISOString() || null,
            createdAt: post.createdAt.toISOString(),
            platform: post.platform?.toLowerCase(),
            linkedGroupId: post.linkedGroupId,
        })),
        linkedGroupId,
        count: createdPosts.length,
    }, { status: 201 });
}
