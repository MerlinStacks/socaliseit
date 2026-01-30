/**
 * Posts API Routes
 * CRUD operations for posts with real database integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * GET /api/posts - List posts for current workspace
 * Query params: status, platform, limit, offset
 */
export async function GET(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.user.currentWorkspaceId;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build where clause based on filters
    const where: Record<string, unknown> = { workspaceId };
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
 * POST /api/posts - Create a new post
 */
export async function POST(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.user.currentWorkspaceId;
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
        platformSettings, // { [accountId]: { postType, callToAction, caption, mediaIds } }
    } = body;

    // Type for platform settings input
    type PlatformSettingsInput = {
        postType?: string;
        callToAction?: string;
        caption?: string;
        mediaIds?: string[];
    };
    const parsedPlatformSettings: Record<string, PlatformSettingsInput> =
        platformSettings && typeof platformSettings === 'object' ? platformSettings : {};


    // Validate required fields
    if (!caption || typeof caption !== 'string') {
        return NextResponse.json({ error: 'Caption is required' }, { status: 400 });
    }

    if (!platformAccountIds || !Array.isArray(platformAccountIds) || platformAccountIds.length === 0) {
        return NextResponse.json({ error: 'At least one platform account is required' }, { status: 400 });
    }

    // Create post with relations
    const post = await db.post.create({
        data: {
            workspaceId,
            caption,
            status: scheduledAt ? 'SCHEDULED' : 'DRAFT',
            scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
            autoPublish: autoPublish === true,
            pillarId: pillarId || null,
            platforms: {
                create: platformAccountIds.map((accountId: string) => {
                    const settings = parsedPlatformSettings[accountId] || {};
                    return {
                        socialAccountId: accountId,
                        status: scheduledAt ? 'SCHEDULED' : 'DRAFT',
                        postType: (settings.postType?.toUpperCase() as 'FEED' | 'REEL' | 'STORY' | 'CAROUSEL' | 'PIN' | 'VIDEO' | 'ARTICLE' | 'THREAD') || 'FEED',
                        callToAction: settings.callToAction || null,
                        caption: settings.caption || null,
                        customMediaIds: settings.mediaIds || [],
                    };
                })
            },

            media: mediaIds?.length ? {
                create: mediaIds.map((mediaId: string, index: number) => ({
                    mediaId,
                    order: index
                }))
            } : undefined,
            hashtags: hashtags?.length ? {
                create: await Promise.all(
                    hashtags.map(async (tag: string) => {
                        // Find or create hashtag
                        const hashtag = await db.hashtag.upsert({
                            where: { tag: tag.toLowerCase().replace('#', '') },
                            update: { usageCount: { increment: 1 } },
                            create: { tag: tag.toLowerCase().replace('#', '') }
                        });
                        return { hashtagId: hashtag.id };
                    })
                )
            } : undefined
        },
        include: {
            pillar: true,
            platforms: { include: { socialAccount: true } },
            media: { include: { media: true } }
        }
    });

    // Log activity
    await db.activity.create({
        data: {
            workspaceId,
            userId,
            userName,
            action: scheduledAt ? 'scheduled' : 'created',
            resourceType: 'post',
            resourceId: post.id,
            resourceName: caption.slice(0, 50) + (caption.length > 50 ? '...' : ''),
            details: scheduledAt
                ? `Scheduled for ${new Date(scheduledAt).toLocaleString()}`
                : undefined
        }
    });

    return NextResponse.json({
        id: post.id,
        caption: post.caption,
        status: post.status.toLowerCase(),
        scheduledAt: post.scheduledAt?.toISOString() || null,
        createdAt: post.createdAt.toISOString(),
        platforms: post.platforms.map(pp => pp.socialAccount.platform.toLowerCase()),
        mediaCount: post.media.length
    }, { status: 201 });
}
