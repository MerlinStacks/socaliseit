/**
 * Post CRUD Handler Logic
 *
 * Why: Extracted from route.ts to keep the route file as a thin dispatcher.
 * Each handler contains the business logic for its HTTP verb, while route.ts
 * handles request parsing and delegates here.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { reschedulePost, cancelScheduledPost, retryFailedPost, schedulePublishReminder, cancelPublishReminder } from '@/lib/queue';
import { logger } from '@/lib/logger';
import { sanitizeError } from '@/lib/sanitize-error';
import { sanitizeForDb } from '@/lib/sanitize-string';
import { invalidatePostCaches } from '@/lib/cache';

// ---------------------------------------------------------------------------
// Shared Types
// ---------------------------------------------------------------------------

/**
 * Type for platform settings input
 * Why: Must match all fields sent by buildPostPayload to avoid silent data loss.
 */
export type PlatformSettingsInput = {
    postType?: string;
    callToAction?: string;
    caption?: string;
    mediaIds?: string[];
    firstComment?: string;
    location?: string;
    pinTitle?: string;
    pinLink?: string;
    boardId?: string;
    videoTitle?: string;
    youtubeCategory?: string;
    youtubePlaylist?: string;
    videoTags?: string[];
    createFirstLike?: boolean;
    embeddable?: boolean;
    notifySubscribers?: boolean;
    madeForKids?: boolean;
    youtubePrivacy?: 'public' | 'private' | 'unlisted';
    tiktokBrandOrganic?: boolean;
    tiktokBrandContent?: boolean;
    tiktokIsAigc?: boolean;
    tiktokComments?: boolean;
    tiktokDuets?: boolean;
    tiktokStitches?: boolean;
    instagramShareToFeed?: boolean;
    instagramComments?: boolean;
};

/** Auth context passed into every handler */
export interface HandlerContext {
    id: string;
    organizationId: string;
    userId: string;
    userName: string;
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

/**
 * Get a single post with all relations.
 *
 * Why: Needed for edit mode in compose page to load existing post data.
 */
export async function handleGetPost(ctx: HandlerContext) {
    const post = await db.post.findUnique({
        where: { id: ctx.id },
        include: {
            pillar: { select: { id: true, name: true, color: true } },
            socialAccount: {
                select: { id: true, platform: true, name: true, username: true, avatar: true }
            },
            analytics: true,
            media: {
                include: {
                    media: { select: { id: true, url: true, thumbnailUrl: true, mimeType: true, size: true } }
                },
                orderBy: { order: 'asc' as const }
            },
            hashtags: {
                include: {
                    hashtag: { select: { id: true, tag: true } }
                }
            }
        }
    });

    if (!post) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (post.organizationId !== ctx.organizationId) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const { analyticsData, platformAccountIds, platforms } = transformPost(post);

    const transformedPost = {
        id: post.id,
        caption: post.caption,
        status: post.status.toLowerCase(),
        scheduledAt: post.scheduledAt?.toISOString() || null,
        publishedAt: post.publishedAt?.toISOString() || null,
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
        firstComment: post.firstComment || null,
        autoPublish: post.autoPublish,
        pillar: post.pillar ? { id: post.pillar.id, name: post.pillar.name, color: post.pillar.color } : null,
        linkedGroupId: post.linkedGroupId,
        platformAccountIds,
        platforms,
        media: post.media.map(pm => ({
            id: pm.media.id,
            url: pm.media.url,
            thumbnailUrl: pm.media.thumbnailUrl,
            type: pm.media.mimeType.startsWith('video/') ? 'video' : 'image',
            size: pm.media.size,
        })),
        hashtags: post.hashtags.map(ph => ph.hashtag.tag),
        analytics: analyticsData,
    };

    return NextResponse.json(transformedPost);
}

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------

/**
 * Full update of a post.
 *
 * Why: Handles edit mode from compose page, updating all post data
 * including media and platform-specific settings.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleUpdatePost(ctx: HandlerContext, body: any) {
    const existing = await db.post.findUnique({
        where: { id: ctx.id },
    });
    if (!existing || existing.organizationId !== ctx.organizationId) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Why: Editing mid-publish causes the worker to read stale data
    if (existing.status === 'PUBLISHED') {
        return NextResponse.json({ error: 'Cannot update published posts' }, { status: 400 });
    }
    if (existing.status === 'PUBLISHING') {
        return NextResponse.json(
            { error: 'This post is currently being published. Please wait for it to finish before editing.' },
            { status: 409 }
        );
    }

    const {
        caption, scheduledAt, pillarId, firstComment,
        mediaIds, platformSettings,
        autoPublish, postType, callToAction,
    } = body;

    const parsedPlatformSettings: Record<string, PlatformSettingsInput> =
        platformSettings && typeof platformSettings === 'object' ? platformSettings : {};

    // Why: When scheduledAt is undefined (not sent), preserve existing value
    const newScheduledAt = scheduledAt !== undefined
        ? (scheduledAt ? new Date(scheduledAt) : null)
        : existing.scheduledAt;
    const effectiveAutoPublish = autoPublish !== undefined ? autoPublish === true : existing.autoPublish;

    let newStatus: import('@/generated/prisma/enums').PostStatus = existing.status as import('@/generated/prisma/enums').PostStatus;
    const hasFutureSchedule = newScheduledAt && newScheduledAt.getTime() > Date.now();
    if (autoPublish === true && !hasFutureSchedule) {
        newStatus = 'SCHEDULED';
    } else if (newScheduledAt) {
        newStatus = 'SCHEDULED';
    } else {
        newStatus = 'DRAFT';
    }

    // Transaction: update post + relations atomically
    const updatedPost = await db.$transaction(async (tx) => {
        return updatePost(tx, ctx.id, existing, {
            caption, newScheduledAt, newStatus, pillarId,
            firstComment, mediaIds, effectiveAutoPublish,
            postType, callToAction, parsedPlatformSettings,
        });
    });

    // Handle scheduling changes
    await handleSchedulingChanges(ctx.id, ctx.organizationId, existing, {
        newScheduledAt, autoPublish, hasFutureSchedule: !!hasFutureSchedule,
        caption: caption || existing.caption,
        platform: existing.platform || 'unknown',
    });

    // Log activity
    await db.activity.create({
        data: {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            userName: ctx.userName,
            action: 'updated',
            resourceType: 'post',
            resourceId: ctx.id,
            resourceName: sanitizeForDb(caption || existing.caption, 50),
        }
    });

    logger.info({ postId: ctx.id, organizationId: ctx.organizationId }, 'Post updated via edit');

    // Invalidate dashboard/analytics caches
    invalidatePostCaches(ctx.organizationId);

    return NextResponse.json({
        id: updatedPost.id,
        caption: updatedPost.caption,
        status: updatedPost.status.toLowerCase(),
        scheduledAt: updatedPost.scheduledAt?.toISOString() || null,
        updatedAt: updatedPost.updatedAt.toISOString(),
    });
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

/**
 * Delete post and cancel any scheduled jobs.
 */
export async function handleDeletePost(ctx: HandlerContext) {
    const post = await db.post.findUnique({ where: { id: ctx.id } });
    if (!post || post.organizationId !== ctx.organizationId) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Why: Deleting mid-publish could crash the worker or orphan content
    if (post.status === 'PUBLISHING') {
        return NextResponse.json(
            { error: 'This post is currently being published. Please wait for it to finish before deleting.' },
            { status: 409 }
        );
    }

    if (post.status === 'SCHEDULED') {
        try {
            await cancelScheduledPost(ctx.id);
            await cancelPublishReminder(ctx.id);
        } catch (error) {
            logger.warn({ postId: ctx.id, error }, 'Failed to cancel scheduled job during delete');
        }
    }

    await db.post.delete({ where: { id: ctx.id } });

    await db.activity.create({
        data: {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            userName: ctx.userName,
            action: 'deleted',
            resourceType: 'post',
            resourceId: ctx.id,
            resourceName: sanitizeForDb(post.caption, 50),
        }
    });

    logger.info({ postId: ctx.id, organizationId: ctx.organizationId }, 'Post deleted');

    // Invalidate dashboard/analytics caches
    invalidatePostCaches(ctx.organizationId);

    return NextResponse.json({ success: true, deletedId: ctx.id });
}

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

/**
 * Partial update (reschedule, status change).
 * Why: Handles calendar drag-drop reschedule and retry actions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handlePatchPost(ctx: HandlerContext, body: any) {
    const { action, scheduledAt } = body;

    const post = await db.post.findUnique({ where: { id: ctx.id } });
    if (!post || post.organizationId !== ctx.organizationId) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (action === 'reschedule') {
        return handleReschedule(ctx, post, scheduledAt);
    }

    if (action === 'retry') {
        return handleRetry(ctx, post);
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/** Transform a post for the GET response */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformPost(post: any) {
    const platformAccountIds = [post.socialAccountId!];
    const platforms = [{
        accountId: post.socialAccountId!,
        platform: post.platform!.toLowerCase(),
        name: post.socialAccount?.name || 'Unknown',
        username: post.socialAccount?.username || null,
        avatar: post.socialAccount?.avatar || null,
        status: post.status.toLowerCase(),
        postType: post.postType.toLowerCase(),
        callToAction: post.callToAction,
        captionOverride: null,
        customMediaIds: post.customMediaIds,
        firstComment: post.firstComment,
        autoPublish: post.autoPublish,
        location: post.location,
        pinTitle: post.pinTitle, pinLink: post.pinLink, boardId: post.boardId,
        videoTitle: post.videoTitle, youtubeCategory: post.youtubeCategory,
        youtubePlaylist: post.youtubePlaylist, videoTags: post.videoTags,
        youtubePrivacy: post.youtubePrivacy, createFirstLike: post.createFirstLike,
        embeddable: post.embeddable, notifySubscribers: post.notifySubscribers,
        madeForKids: post.madeForKids,
        tiktokBrandOrganic: post.tiktokBrandOrganic, tiktokBrandContent: post.tiktokBrandContent,
        tiktokIsAigc: post.tiktokIsAigc, tiktokComments: post.tiktokComments,
        tiktokDuets: post.tiktokDuets, tiktokStitches: post.tiktokStitches,
        instagramShareToFeed: post.instagramShareToFeed, instagramComments: post.instagramComments,
    }];

    const analyticsData = post.analytics ? {
        impressions: post.analytics.impressions,
        reach: post.analytics.reach,
        likes: post.analytics.likes,
        comments: post.analytics.comments,
        shares: post.analytics.shares,
        saves: post.analytics.saves,
        clicks: post.analytics.clicks,
        videoViews: post.analytics.videoViews || 0,
        videoWatchTime: post.analytics.videoWatchTime || 0,
        avgWatchPercentage: post.analytics.avgWatchPercentage,
        syncedAt: post.analytics.syncedAt?.toISOString() || null,
    } : null;

    return { analyticsData, platformAccountIds, platforms };
}



/** Update a post inside a transaction */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updatePost(tx: any, id: string, existing: any, opts: any) {
    const acctSettings = opts.parsedPlatformSettings[existing.socialAccountId!] || {};
    const effectivePostType = acctSettings.postType
        ? (acctSettings.postType.toUpperCase() as 'FEED' | 'REEL' | 'STORY' | 'CAROUSEL' | 'PIN' | 'VIDEO' | 'ARTICLE' | 'THREAD')
        : (opts.postType ? (opts.postType.toUpperCase() as 'FEED' | 'REEL' | 'STORY' | 'CAROUSEL' | 'PIN' | 'VIDEO' | 'ARTICLE' | 'THREAD') : existing.postType);
    const effectiveCallToAction = acctSettings.callToAction !== undefined
        ? (acctSettings.callToAction || null)
        : (opts.callToAction !== undefined ? opts.callToAction : existing.callToAction);
    const effectiveFirstComment = acctSettings.firstComment !== undefined
        ? (acctSettings.firstComment || null)
        : (opts.firstComment ?? existing.firstComment ?? null);

    const post = await tx.post.update({
        where: { id },
        data: {
            caption: opts.caption ?? existing.caption,
            scheduledAt: opts.newScheduledAt,
            status: opts.newStatus,
            pillarId: opts.pillarId || null,
            firstComment: effectiveFirstComment,
            autoPublish: opts.effectiveAutoPublish,
            postType: effectivePostType,
            callToAction: effectiveCallToAction,
            customMediaIds: opts.mediaIds ?? existing.customMediaIds,
            updatedAt: new Date(),
            location: acctSettings.location !== undefined ? (acctSettings.location || null) : existing.location,
            pinTitle: acctSettings.pinTitle !== undefined ? (acctSettings.pinTitle || null) : existing.pinTitle,
            pinLink: acctSettings.pinLink !== undefined ? (acctSettings.pinLink || null) : existing.pinLink,
            boardId: acctSettings.boardId !== undefined ? (acctSettings.boardId || null) : existing.boardId,
            videoTitle: acctSettings.videoTitle !== undefined ? (acctSettings.videoTitle || null) : existing.videoTitle,
            youtubeCategory: acctSettings.youtubeCategory !== undefined ? (acctSettings.youtubeCategory || null) : existing.youtubeCategory,
            youtubePlaylist: acctSettings.youtubePlaylist !== undefined ? (acctSettings.youtubePlaylist || null) : existing.youtubePlaylist,
            videoTags: acctSettings.videoTags ?? existing.videoTags,
            youtubePrivacy: acctSettings.youtubePrivacy !== undefined ? (acctSettings.youtubePrivacy || null) : existing.youtubePrivacy,
            createFirstLike: acctSettings.createFirstLike ?? existing.createFirstLike,
            embeddable: acctSettings.embeddable ?? existing.embeddable,
            notifySubscribers: acctSettings.notifySubscribers ?? existing.notifySubscribers,
            madeForKids: acctSettings.madeForKids ?? existing.madeForKids,
            tiktokBrandOrganic: acctSettings.tiktokBrandOrganic ?? existing.tiktokBrandOrganic,
            tiktokBrandContent: acctSettings.tiktokBrandContent ?? existing.tiktokBrandContent,
            tiktokIsAigc: acctSettings.tiktokIsAigc ?? existing.tiktokIsAigc,
            tiktokComments: acctSettings.tiktokComments ?? existing.tiktokComments,
            tiktokDuets: acctSettings.tiktokDuets ?? existing.tiktokDuets,
            tiktokStitches: acctSettings.tiktokStitches ?? existing.tiktokStitches,
            instagramShareToFeed: acctSettings.instagramShareToFeed ?? existing.instagramShareToFeed,
            instagramComments: acctSettings.instagramComments ?? existing.instagramComments,
        },
    });

    if (opts.mediaIds && Array.isArray(opts.mediaIds)) {
        await tx.postMedia.deleteMany({ where: { postId: id } });
        for (let i = 0; i < opts.mediaIds.length; i++) {
            await tx.postMedia.create({ data: { postId: id, mediaId: opts.mediaIds[i], order: i } });
        }
    }

    return post;
}



/** Handle scheduling changes after a PUT */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSchedulingChanges(
    postId: string,
    organizationId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    existing: any,
    opts: { newScheduledAt: Date | null; autoPublish: boolean; hasFutureSchedule: boolean; caption: string; platform: string },
) {
    const scheduledAtChanged = existing.scheduledAt?.getTime() !== opts.newScheduledAt?.getTime();
    if (!scheduledAtChanged && opts.autoPublish !== true) return;

    try {
        if (existing.status === 'SCHEDULED') {
            await cancelPublishReminder(postId);
        }

        if (opts.autoPublish === true && opts.hasFutureSchedule) {
            await reschedulePost(postId, organizationId, opts.newScheduledAt!);
            logger.info({ postId, scheduledAt: opts.newScheduledAt }, 'Post scheduled for auto-publishing after edit');
        } else if (opts.autoPublish === true) {
            const { publishNow } = await import('@/lib/queue');
            await publishNow(postId, organizationId);
            logger.info({ postId }, 'Post queued for immediate publishing after edit');
        } else if (opts.newScheduledAt) {
            await schedulePublishReminder(postId, organizationId, opts.caption, opts.platform, opts.newScheduledAt);
            logger.info({ postId, scheduledAt: opts.newScheduledAt }, 'Post reminder rescheduled after edit');
        }
    } catch (error) {
        logger.error({ postId, error }, 'Failed to update scheduled job after edit');
    }
}

/** Handle the reschedule action from PATCH */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleReschedule(ctx: HandlerContext, post: any, scheduledAt: string | undefined) {
    if (!scheduledAt) {
        return NextResponse.json({ error: 'scheduledAt is required for reschedule' }, { status: 400 });
    }

    if (post.status !== 'DRAFT' && post.status !== 'SCHEDULED' && post.status !== 'FAILED') {
        return NextResponse.json({ error: `Cannot reschedule post in ${post.status} status` }, { status: 400 });
    }

    try {
        const result = await reschedulePost(ctx.id, ctx.organizationId, new Date(scheduledAt));

        await db.activity.create({
            data: {
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                userName: ctx.userName,
                action: 'rescheduled',
                resourceType: 'post',
                resourceId: ctx.id,
                resourceName: sanitizeForDb(post.caption, 50),
                details: sanitizeForDb(`Rescheduled to ${new Date(scheduledAt).toLocaleString()}`),
            }
        });

        logger.info({ postId: ctx.id, newScheduledAt: scheduledAt, jobId: result.jobId }, 'Post rescheduled via calendar');

        // Invalidate dashboard/analytics caches
        invalidatePostCaches(ctx.organizationId);

        return NextResponse.json({
            id: ctx.id,
            scheduledAt: result.scheduledAt.toISOString(),
            status: 'scheduled',
            updatedAt: new Date().toISOString(),
        });
    } catch (error) {
        logger.error({ postId: ctx.id, error }, 'Failed to reschedule post');
        return NextResponse.json({ error: sanitizeError(error, 'Failed to reschedule post') }, { status: 500 });
    }
}

/** Handle the retry action from PATCH */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRetry(ctx: HandlerContext, post: any) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const isStuckPublishing = post.status === 'PUBLISHING' && post.updatedAt < fiveMinutesAgo;

    if (post.status !== 'FAILED' && post.status !== 'PUBLISHING') {
        return NextResponse.json({ error: 'Can only retry posts in FAILED or PUBLISHING status' }, { status: 400 });
    }

    if (post.status === 'PUBLISHING') {
        if (!isStuckPublishing) {
            return NextResponse.json(
                { error: 'Post is currently being published. Please wait a few minutes before retrying.' },
                { status: 400 }
            );
        }
        logger.info({ postId: ctx.id }, 'Resetting stuck PUBLISHING post to FAILED for retry');
        await db.post.update({ where: { id: ctx.id }, data: { status: 'FAILED' } });
    }

    try {
        const result = await retryFailedPost(ctx.id, ctx.organizationId);

        await db.activity.create({
            data: {
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                userName: ctx.userName,
                action: 'retried',
                resourceType: 'post',
                resourceId: ctx.id,
                resourceName: sanitizeForDb(post.caption, 50),
                details: 'Retrying failed post',
            }
        });

        logger.info({ postId: ctx.id, jobId: result.jobId }, 'Failed post retry queued');

        // Invalidate dashboard/analytics caches
        invalidatePostCaches(ctx.organizationId);

        return NextResponse.json({ id: ctx.id, status: 'publishing', jobId: result.jobId });
    } catch (error) {
        logger.error({ postId: ctx.id, error }, 'Failed to retry post');
        return NextResponse.json({ error: sanitizeError(error, 'Failed to retry post') }, { status: 500 });
    }
}
