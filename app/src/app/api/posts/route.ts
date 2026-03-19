/**
 * Posts API Routes
 * CRUD operations for posts with real database integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { schedulePost, publishNow, schedulePublishReminder } from '@/lib/queue';
import { logger } from '@/lib/logger';
import crypto from 'crypto';
import { sanitizeForDb } from '@/lib/sanitize-string';
import { type PlatformSettingsInput } from '@/types/platform-settings';


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
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

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
                socialAccount: {
                    select: { id: true, platform: true, name: true, avatar: true }
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
        platform: post.platform?.toLowerCase() ?? null,
        account: post.socialAccount ? {
            id: post.socialAccount.platform.toLowerCase(),
            name: post.socialAccount.name,
            avatar: post.socialAccount.avatar
        } : null,
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

    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
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

    /** Why: Uses shared PlatformSettingsInput — single source of truth with compose-actions.ts */
    const parsedPlatformSettings: Record<string, PlatformSettingsInput> =
        platformSettings && typeof platformSettings === 'object' ? platformSettings : {};


    // Determine if ALL platforms are stories (stories don't require captions)
    const allPlatformsAreStories = platformAccountIds.every((accountId: string) => {
        const settings = parsedPlatformSettings[accountId] || {};
        return settings.postType?.toUpperCase() === 'STORY';
    });

    // Allow empty main caption if every non-story platform has a per-platform caption override
    const allNonStoriesHaveCaptions = platformAccountIds
        .filter((id: string) => parsedPlatformSettings[id]?.postType?.toUpperCase() !== 'STORY')
        .every((id: string) => parsedPlatformSettings[id]?.caption?.trim());

    // Validate required fields (caption only required for auto-publish posts where no platform-specific captions cover all non-story accounts)
    // Why: Quick Add creates draft placeholders (autoPublish=false) without captions — users add them later in the composer.
    const isAutoPublish = autoPublish === true;
    if (isAutoPublish && !allPlatformsAreStories && !allNonStoriesHaveCaptions && (!caption || typeof caption !== 'string' || caption.trim() === '')) {
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

    // Why (BUG-09): validatePostContent existed but was never called from any
    // API route. Content length validation only happened client-side, so any
    // API client (curl, automation) could bypass limits entirely. Posts would
    // then fail at publish-time with a vague platform API error.
    const { validatePostContent } = await import('@/lib/validate-post');
    const effectiveCaption = caption || '';
    const validationErrors: string[] = [];
    for (const account of socialAccounts) {
        const platformKey = account.platform.toLowerCase() as Parameters<typeof validatePostContent>[0];
        const perPlatformCaption = parsedPlatformSettings[account.id]?.caption || effectiveCaption;
        const result = validatePostContent(platformKey, {
            caption: perPlatformCaption,
            mediaCount: mediaIds?.length,
            /** Why (HT02): postType must be forwarded so story/reel media limits are enforced */
            postType: parsedPlatformSettings[account.id]?.postType,
        });
        if (!result.valid) {
            validationErrors.push(...result.errors);
        }
    }
    if (validationErrors.length > 0) {
        return NextResponse.json(
            { error: validationErrors.join('; ') },
            { status: 400 }
        );
    }

    // Validate pillarId belongs to this organization
    if (pillarId) {
        const pillar = await db.contentPillar.findUnique({
            where: { id: pillarId },
            select: { organizationId: true },
        });
        if (!pillar || pillar.organizationId !== organizationId) {
            return NextResponse.json({ error: 'Content pillar not found' }, { status: 400 });
        }
    }

    // BUG-09: Validate scheduledAt is not in the past
    // Why: A past scheduledAt causes BullMQ delay=0, triggering immediate publish
    // without user intent. 30s grace handles clock skew and request latency.
    if (scheduledAt) {
        const scheduledDate = new Date(scheduledAt);
        const gracePeriodMs = 30_000;
        if (scheduledDate.getTime() < Date.now() - gracePeriodMs) {
            return NextResponse.json(
                { error: 'Scheduled time must be in the future' },
                { status: 400 }
            );
        }
    }
    // Pre-create hashtag records (deduplicate to prevent unique constraint errors)
    // Why: Sequential upserts prevent race conditions where concurrent identical
    // hashtag creates lose usageCount increments.
    let hashtagRecords: { id: string }[] = [];
    if (hashtags?.length) {
        const uniqueTags = [...new Set((hashtags as string[]).map(t => t.toLowerCase().replace('#', '')))];
        for (const tag of uniqueTags) {
            const hashtag = await db.hashtag.upsert({
                where: { tag },
                update: { usageCount: { increment: 1 } },
                create: { tag },
            });
            hashtagRecords.push({ id: hashtag.id });
        }
    }

    // Generate linkedGroupId for multi-platform posts
    // Why: Links posts created together while keeping them independent
    const linkedGroupId = platformAccountIds.length > 1
        ? crypto.randomUUID()
        : null;

    // Create one Post per platform (NEW ARCHITECTURE)
    const createdPosts = await Promise.all(
        socialAccounts.map(async (account) => {
            const settings = parsedPlatformSettings[account.id] || {};
            const postCaption = settings.caption || caption || '';
            const postFirstComment = settings.firstComment || firstComment || null;
            const postMediaIds = settings.mediaIds || mediaIds || [];

            // Why: Favor per-platform autoPublish, falling back to top-level toggle. Let the top-level autoPublish dictate the default if per-platform not set.
            const platformAutoPublish = settings.autoPublish !== undefined ? settings.autoPublish : (autoPublish === true);

            const post = await db.post.create({
                data: {
                    organizationId,
                    caption: postCaption,
                    // Why (BUG-41): When autoPublish=true (no scheduledAt), create as SCHEDULED
                    // not DRAFT. Otherwise there's a race where the post appears in the
                    // drafts feed before publishNow() picks it up.
                    status: scheduledAt ? 'SCHEDULED' : (platformAutoPublish ? 'SCHEDULED' : 'DRAFT'),
                    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
                    autoPublish: platformAutoPublish,
                    firstComment: postFirstComment,
                    pillarId: pillarId || null,
                    // NEW: Direct platform fields
                    platform: account.platform,
                    socialAccountId: account.id,
                    postType: (settings.postType?.toUpperCase() as 'FEED' | 'REEL' | 'STORY' | 'CAROUSEL' | 'PIN' | 'VIDEO' | 'ARTICLE' | 'THREAD') || 'FEED',
                    callToAction: settings.callToAction || null,
                    // Pinterest-specific fields
                    pinTitle: settings.pinTitle || null,
                    pinLink: settings.pinLink || null,
                    boardId: settings.boardId || null,
                    // Location tagging (Instagram, TikTok, Facebook)
                    location: settings.location || null,
                    // YouTube-specific fields
                    videoTitle: settings.videoTitle || null,
                    youtubeCategory: settings.youtubeCategory || null,
                    youtubePlaylist: settings.youtubePlaylist || null,
                    videoTags: settings.videoTags || [],
                    createFirstLike: settings.createFirstLike ?? false,
                    embeddable: settings.embeddable ?? true,
                    notifySubscribers: settings.notifySubscribers ?? true,
                    madeForKids: settings.madeForKids ?? false,
                    youtubePrivacy: settings.youtubePrivacy || null,
                    // Why (BUG-36): Persist YouTube comments toggle from composer
                    youtubeCommentsEnabled: settings.youtubeCommentsEnabled ?? true,
                    // Why (BUG-37): Persist LinkedIn visibility from composer
                    linkedinVisibility: settings.linkedinVisibility || null,
                    // TikTok-specific fields
                    tiktokPrivacyLevel: settings.tiktokPrivacyLevel || null,
                    tiktokContentDisclosure: settings.tiktokContentDisclosure ?? false,
                    tiktokBrandOrganic: settings.tiktokBrandOrganic ?? false,
                    tiktokBrandContent: settings.tiktokBrandContent ?? false,
                    tiktokIsAigc: settings.tiktokIsAigc ?? false,
                    tiktokComments: settings.tiktokComments ?? true,
                    tiktokDuets: settings.tiktokDuets ?? true,
                    tiktokStitches: settings.tiktokStitches ?? true,
                    // Instagram-specific fields
                    instagramShareToFeed: settings.instagramShareToFeed ?? true,
                    instagramComments: settings.instagramComments ?? true,
                    customMediaIds: postMediaIds,
                    linkedGroupId,
                    notifyDeviceIds: settings.notifyDeviceIds || [],
                    // Media relations
                    media: postMediaIds.length ? {
                        create: postMediaIds.map((mediaId: string, index: number) => ({
                            mediaId,
                            order: index
                        }))
                    } : undefined,
                    // Product Tags
                    productTags: settings.productTags?.length ? {
                        create: settings.productTags.map(pt => ({
                            platformProductId: pt.platformProductId,
                            productName: pt.productName,
                            mediaIndex: pt.mediaIndex,
                            positionX: pt.positionX,
                            positionY: pt.positionY
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
                resourceName: sanitizeForDb(post.caption, 50),
                details: scheduledAt
                    ? sanitizeForDb(`Scheduled for ${new Date(scheduledAt).toISOString()} (${post.platform})`)
                    : undefined
            }
        });
    }

    // Queue each post for publishing or schedule reminders
    for (const post of createdPosts) {
        try {
            if (autoPublish === true && scheduledAt) {
                // Why: autoPublish + future scheduledAt means "auto-publish at that time",
                // not "publish immediately". Uses BullMQ delayed job.
                const result = await schedulePost(post.id, organizationId, {
                    datetime: new Date(scheduledAt),
                    timezone: 'UTC',
                    platforms: [],
                });
                logger.info({ postId: post.id, jobId: result.jobId, scheduledAt }, 'Post scheduled for auto-publishing');
            } else if (autoPublish === true) {
                // No scheduled time — publish immediately
                const result = await publishNow(post.id, organizationId);
                logger.info({ postId: post.id, jobId: result.jobId }, 'Post queued for immediate publishing');
            } else if (scheduledAt) {
                // autoPublish is false: schedule a notification reminder instead
                await schedulePublishReminder(
                    post.id,
                    organizationId,
                    post.caption || '',
                    post.platform || 'unknown',
                    new Date(scheduledAt)
                );
                logger.info({ postId: post.id, scheduledAt }, 'Post reminder scheduled (manual publish)');
            }
        } catch (queueError) {
            logger.error({ postId: post.id, error: queueError }, 'Failed to queue post for publishing');
            // Why: If publishNow/schedulePost fails (Redis down, BullMQ error),
            // the post is stuck as SCHEDULED with no queue job. Reset to DRAFT
            // so the user can see it and retry.
            if (post.status === 'SCHEDULED') {
                await db.post.update({
                    where: { id: post.id },
                    data: { status: 'DRAFT' },
                }).catch(() => { /* best effort fallback */ });
            }
        }
    }

    // Invalidate dashboard/analytics caches so they reflect the new posts
    const { invalidatePostCaches } = await import('@/lib/cache');
    invalidatePostCaches(organizationId);

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
