/**
 * Post CRUD Handler Logic
 *
 * Why: Extracted from route.ts to keep the route file as a thin dispatcher.
 * Each handler contains the business logic for its HTTP verb, while route.ts
 * handles request parsing and delegates here.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { reschedulePost, retryFailedPost, schedulePublishReminder, cancelPublishReminder, schedulePost } from '@/lib/queue';
import { logger } from '@/lib/logger';
import { sanitizeError } from '@/lib/sanitize-error';
import { sanitizeForDb } from '@/lib/sanitize-string';
import { invalidatePostCaches } from '@/lib/cache';
import crypto from 'crypto';

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
    /** Why (BUG-36): YouTube comments toggle was previously missing from the type */
    youtubeCommentsEnabled?: boolean;
    /** Why (BUG-37): LinkedIn visibility was previously missing from the type */
    linkedinVisibility?: string;
    altText?: string;
    threadsTopicTag?: string;
    threadsQuotePostId?: string;
    tiktokPrivacyLevel?: string;
    tiktokContentDisclosure?: boolean;
    tiktokBrandOrganic?: boolean;
    tiktokBrandContent?: boolean;
    tiktokIsAigc?: boolean;
    tiktokComments?: boolean;
    tiktokDuets?: boolean;
    tiktokStitches?: boolean;
    instagramShareToFeed?: boolean;
    instagramComments?: boolean;
    isTrialReel?: boolean;
    autoPublish?: boolean;
    notifyDeviceIds?: string[];
    productTags?: Array<{
        platformProductId: string;
        productName: string;
        mediaIndex: number;
        positionX?: number;
        positionY?: number;
    }>;
};

/** Auth context passed into every handler */
export interface HandlerContext {
    id: string;
    organizationId: string;
    userId: string;
    userName: string;
}

// ---------------------------------------------------------------------------
// Minimal Prisma-typed interfaces (avoids `any` without importing generated types)
// ---------------------------------------------------------------------------

/** Post record shape returned by the full GET query with all includes */
interface PostWithRelations {
    id: string;
    organizationId: string;
    caption: string;
    status: string;
    scheduledAt: Date | null;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    firstComment: string | null;
    autoPublish: boolean;
    customMediaIds: string[] | null;
    linkedGroupId: string | null;
    pillarId: string | null;
    platform: string | null;
    socialAccountId: string | null;
    socialAccount: { id: string; platform: string; name: string; username: string | null; avatar: string | null } | null;
    postType: string;
    callToAction: string | null;
    location: string | null;
    pinTitle: string | null;
    pinLink: string | null;
    boardId: string | null;
    videoTitle: string | null;
    youtubeCategory: string | null;
    youtubePlaylist: string | null;
    videoTags: string[];
    youtubePrivacy: string | null;
    createFirstLike: boolean;
    embeddable: boolean;
    notifySubscribers: boolean;
    madeForKids: boolean;
    youtubeCommentsEnabled: boolean;
    linkedinVisibility: string | null;
    altText: string | null;
    threadsTopicTag: string | null;
    threadsQuotePostId: string | null;
    tiktokPrivacyLevel: string | null;
    tiktokContentDisclosure: boolean;
    tiktokBrandOrganic: boolean;
    tiktokBrandContent: boolean;
    tiktokIsAigc: boolean;
    tiktokComments: boolean;
    tiktokDuets: boolean;
    tiktokStitches: boolean;
    instagramShareToFeed: boolean;
    instagramComments: boolean;
    isTrialReel: boolean;
    notifyDeviceIds: string[];
    media: Array<{ media: { id: string; url: string; thumbnailUrl: string | null; mimeType: string; size: number; filename: string; transcodeStatus: string | null } }>;
    hashtags: Array<{ hashtag: { id: string; tag: string } }>;
    productTags: Array<{
        id: string;
        platformProductId: string;
        productName: string;
        productPrice: number | null;
        productCurrency: string | null;
        productImageUrl: string | null;
        mediaIndex: number | null;
        positionX: number | null;
        positionY: number | null;
        product?: unknown;
    }>;
    analytics: {
        impressions: number;
        reach: number;
        likes: number;
        comments: number;
        shares: number;
        saves: number;
        clicks: number;
        videoViews: number | null;
        videoWatchTime: number | null;
        avgWatchPercentage: number | null;
        platformMetrics: unknown;
        syncedAt: Date | null;
    } | null;
    errors: Array<{ errorHuman: string; suggestion: string | null }>;
}

/** Body shape expected by handleUpdatePost */
interface UpdatePostBody {
    caption?: string;
    scheduledAt?: string;
    pillarId?: string;
    firstComment?: string;
    mediaIds?: string[];
    platformSettings?: Record<string, PlatformSettingsInput>;
    platformAccountIds?: string[];
    autoPublish?: boolean;
    postType?: string;
    callToAction?: string;
}

/** Body shape expected by handlePatchPost */
interface PatchPostBody {
    action?: string;
    scheduledAt?: string;
}

type TransactionClient = any;

/** Options bag passed to updatePost */
interface UpdatePostOptions {
    caption?: string;
    newScheduledAt: Date | null;
    newStatus: string;
    pillarId?: string;
    firstComment?: string;
    mediaIds?: string[];
    effectiveAutoPublish: boolean;
    postType?: string;
    callToAction?: string;
    parsedPlatformSettings: Record<string, PlatformSettingsInput>;
}

/** Existing post shape used for scheduling decisions */
interface SchedulingExisting {
    status: string;
    scheduledAt: Date | null;
    autoPublish: boolean;
    caption?: string;
    updatedAt?: Date;
}

// ---------------------------------------------------------------------------
// Minimal Prisma-typed interfaces (avoids `any` without importing generated types)
// ---------------------------------------------------------------------------

/** Post record shape returned by the full GET query with all includes */
interface PostWithRelations {
    id: string;
    organizationId: string;
    caption: string;
    status: string;
    scheduledAt: Date | null;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    firstComment: string | null;
    autoPublish: boolean;
    customMediaIds: string[] | null;
    linkedGroupId: string | null;
    pillarId: string | null;
    platform: string | null;
    socialAccountId: string | null;
    socialAccount: { id: string; platform: string; name: string; username: string | null; avatar: string | null } | null;
    postType: string;
    callToAction: string | null;
    location: string | null;
    pinTitle: string | null;
    pinLink: string | null;
    boardId: string | null;
    videoTitle: string | null;
    youtubeCategory: string | null;
    youtubePlaylist: string | null;
    videoTags: string[];
    youtubePrivacy: string | null;
    createFirstLike: boolean;
    embeddable: boolean;
    notifySubscribers: boolean;
    madeForKids: boolean;
    youtubeCommentsEnabled: boolean;
    linkedinVisibility: string | null;
    altText: string | null;
    threadsTopicTag: string | null;
    threadsQuotePostId: string | null;
    tiktokPrivacyLevel: string | null;
    tiktokContentDisclosure: boolean;
    tiktokBrandOrganic: boolean;
    tiktokBrandContent: boolean;
    tiktokIsAigc: boolean;
    tiktokComments: boolean;
    tiktokDuets: boolean;
    tiktokStitches: boolean;
    instagramShareToFeed: boolean;
    instagramComments: boolean;
    isTrialReel: boolean;
    notifyDeviceIds: string[];
    media: Array<{ media: { id: string; url: string; thumbnailUrl: string | null; mimeType: string; size: number; filename: string; transcodeStatus: string | null } }>;
    hashtags: Array<{ hashtag: { id: string; tag: string } }>;
    productTags: Array<{
        id: string;
        platformProductId: string;
        productName: string;
        productPrice: number | null;
        productCurrency: string | null;
        productImageUrl: string | null;
        mediaIndex: number | null;
        positionX: number | null;
        positionY: number | null;
        product?: unknown;
    }>;
    analytics: {
        impressions: number;
        reach: number;
        likes: number;
        comments: number;
        shares: number;
        saves: number;
        clicks: number;
        videoViews: number | null;
        videoWatchTime: number | null;
        avgWatchPercentage: number | null;
        platformMetrics: unknown;
        syncedAt: Date | null;
    } | null;
    errors: Array<{ errorHuman: string; suggestion: string | null }>;
}

/** Body shape expected by handleUpdatePost */
interface UpdatePostBody {
    caption?: string;
    scheduledAt?: string;
    pillarId?: string;
    firstComment?: string;
    mediaIds?: string[];
    platformSettings?: Record<string, PlatformSettingsInput>;
    platformAccountIds?: string[];
    autoPublish?: boolean;
    postType?: string;
    callToAction?: string;
}

/** Body shape expected by handlePatchPost */
interface PatchPostBody {
    action?: string;
    scheduledAt?: string;
}


/** Options bag passed to updatePost */
interface UpdatePostOptions {
    caption?: string;
    newScheduledAt: Date | null;
    newStatus: string;
    pillarId?: string;
    firstComment?: string;
    mediaIds?: string[];
    effectiveAutoPublish: boolean;
    postType?: string;
    callToAction?: string;
    parsedPlatformSettings: Record<string, PlatformSettingsInput>;
}

/** Existing post shape used for scheduling decisions */
interface SchedulingExisting {
    status: string;
    scheduledAt: Date | null;
    autoPublish: boolean;
    caption?: string;
    updatedAt?: Date;
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
    let post = await db.post.findUnique({
        where: { id: ctx.id },
        include: {
            pillar: { select: { id: true, name: true, color: true } },
            socialAccount: {
                select: { id: true, platform: true, name: true, username: true, avatar: true }
            },
            analytics: true,
            media: {
                include: {
                    media: { select: { id: true, url: true, thumbnailUrl: true, mimeType: true, size: true, filename: true, transcodeStatus: true } }
                },
                orderBy: { order: 'asc' as const }
            },
            hashtags: {
                include: {
                    hashtag: { select: { id: true, tag: true } }
                }
            },
            productTags: true,
            errors: {
                orderBy: { occurredAt: 'desc' as const },
                take: 1,
                select: { errorHuman: true, suggestion: true },
            },
        }
    });

    if (!post) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (post.organizationId !== ctx.organizationId) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    /**
     * Why: Lazy relink — when a SocialAccount is deleted, onDelete:SetNull
     * nulls socialAccountId. If a replacement account exists for the same
     * org+platform, relink on read so the composer shows the correct account.
     */
    if (!post.socialAccountId && post.platform) {
        const replacement = await db.socialAccount.findFirst({
            where: { organizationId: post.organizationId, platform: post.platform },
            select: { id: true, platform: true, name: true, username: true, avatar: true },
        });

        if (replacement) {
            await db.post.update({
                where: { id: post.id },
                data: { socialAccountId: replacement.id },
            });
            logger.info(
                { postId: post.id, newAccountId: replacement.id, platform: post.platform },
                'Lazy-relinked orphaned post to replacement account',
            );
            // Why: Patch the in-memory post so transformPost uses the corrected data
            post = { ...post, socialAccountId: replacement.id, socialAccount: replacement };
        }
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
            filename: pm.media.filename,
            transcodeStatus: pm.media.transcodeStatus ?? null,
        })),
        hashtags: post.hashtags.map(ph => ph.hashtag.tag),
        analytics: analyticsData,
        latestError: post.errors[0]
            ? { message: post.errors[0].errorHuman, suggestion: post.errors[0].suggestion }
            : null,
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
export async function handleUpdatePost(ctx: HandlerContext, body: UpdatePostBody) {
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
        mediaIds, platformSettings, platformAccountIds,
        autoPublish, postType, callToAction,
    } = body;

    const parsedPlatformSettings: Record<string, PlatformSettingsInput> =
        platformSettings && typeof platformSettings === 'object' ? platformSettings : {};

    // Why: When scheduledAt is undefined (not sent), preserve existing value
    const newScheduledAt = scheduledAt !== undefined
        ? (scheduledAt ? new Date(scheduledAt) : null)
        : existing.scheduledAt;

    // Why (BUG-31): Validate scheduledAt is not in the past, matching the
    // POST route's BUG-09 guard. Without this, editing a post to a past time
    // triggers immediate BullMQ execution (delay=0) without user intent.
    if (scheduledAt !== undefined && newScheduledAt) {
        const gracePeriodMs = 30_000;
        if (newScheduledAt.getTime() < Date.now() - gracePeriodMs) {
            return NextResponse.json(
                { error: 'Scheduled time must be in the future' },
                { status: 400 }
            );
        }
    }

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
        return updatePost(tx, ctx.id, existing as unknown as PostWithRelations, {
            caption, newScheduledAt, newStatus, pillarId,
            firstComment, mediaIds, effectiveAutoPublish,
            postType, callToAction, parsedPlatformSettings,
        });
    });

    // -----------------------------------------------------------------------
    // Why (BUG-FIX): Create new Post rows for newly-added platforms.
    // The system stores one Post per platform account. Previously, the PUT
    // handler only updated the existing Post and ignored additional accounts
    // the user selected during editing. This block detects the new accounts
    // and creates independent Post rows linked via linkedGroupId.
    // -----------------------------------------------------------------------
    if (Array.isArray(platformAccountIds) && platformAccountIds.length > 0) {
        const newAccountIds = platformAccountIds.filter(
            (id: string) => id !== existing.socialAccountId
        );

        if (newAccountIds.length > 0) {
            // Validate all new accounts belong to this organization
            const newAccounts = await db.socialAccount.findMany({
                where: { id: { in: newAccountIds }, organizationId: ctx.organizationId },
                select: { id: true, platform: true },
            });

            if (newAccounts.length > 0) {
                // Ensure the existing post has a linkedGroupId; create one if needed
                let groupId = existing.linkedGroupId;
                if (!groupId) {
                    groupId = crypto.randomUUID();
                    await db.post.update({
                        where: { id: ctx.id },
                        data: { linkedGroupId: groupId },
                    });
                }

                const effectiveCaption = caption ?? existing.caption;
                const effectiveMediaIds = mediaIds ?? existing.customMediaIds ?? [];

                const { createPosts } = await import('@/lib/posts-service');
                for (const account of newAccounts) {
                    const result = await createPosts({
                        organizationId: ctx.organizationId,
                        userId: ctx.userId,
                        userName: ctx.userName,
                        caption: parsedPlatformSettings[account.id]?.caption || effectiveCaption,
                        platformAccountIds: [account.id],
                        mediaIds: (parsedPlatformSettings[account.id]?.mediaIds?.length
                            ? parsedPlatformSettings[account.id].mediaIds
                            : effectiveMediaIds) as string[],
                        scheduledAt: newScheduledAt?.toISOString() ?? undefined,
                        pillarId: pillarId || existing.pillarId || undefined,
                        autoPublish: parsedPlatformSettings[account.id]?.autoPublish ?? effectiveAutoPublish,
                        firstComment: parsedPlatformSettings[account.id]?.firstComment || firstComment || existing.firstComment || undefined,
                        platformSettings: { [account.id]: parsedPlatformSettings[account.id] || {} },
                    });

                    if (result.posts?.length) {
                        // Why: Assign the shared linkedGroupId so all sibling
                        // posts can be found together (e.g. for calendar grouping).
                        for (const newPost of result.posts) {
                            await db.post.update({
                                where: { id: newPost.id },
                                data: { linkedGroupId: groupId },
                            });
                        }
                        logger.info(
                            { postId: result.posts[0].id, parentPostId: ctx.id, accountId: account.id, groupId },
                            'Created new platform post during edit',
                        );
                    } else {
                        logger.warn(
                            { accountId: account.id, error: result.error },
                            'Failed to create new platform post during edit',
                        );
                    }
                }
            }
        }
    }

    // Handle scheduling changes
    await handleSchedulingChanges(ctx.id, ctx.organizationId, existing, {
        newScheduledAt, autoPublish: !!autoPublish, hasFutureSchedule: !!hasFutureSchedule,
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
        id: (updatedPost as { id: string }).id,
        caption: (updatedPost as { caption: string }).caption,
        status: ((updatedPost as { status: string }).status).toLowerCase(),
        scheduledAt: (updatedPost as { scheduledAt: Date | null }).scheduledAt?.toISOString() || null,
        updatedAt: (updatedPost as { updatedAt: Date }).updatedAt.toISOString(),
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
            const { postPublishQueue } = await import('@/lib/bullmq/queues');
            const jobs = await postPublishQueue.getJobs(['delayed', 'waiting']);
            for (const job of jobs) {
                if (job.data.postId === ctx.id) {
                    await job.remove();
                }
            }
            await cancelPublishReminder(ctx.id);
        } catch (error) {
            logger.warn({ postId: ctx.id, error }, 'Failed to cancel scheduled job during delete');
        }
    }

    /**
     * Why (HT05): Decrement hashtag usageCount before deleting.
     * The POST route increments on creation; without this, counts drift upward.
     */
    const postHashtags = await db.postHashtag.findMany({
        where: { postId: ctx.id },
        select: { hashtagId: true },
    });
    for (const ph of postHashtags) {
        await db.hashtag.update({
            where: { id: ph.hashtagId },
            data: { usageCount: { decrement: 1 } },
        }).catch(() => { /* Hashtag may have been deleted */ });
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

    logger.info(
        {
            postId: ctx.id,
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            userName: ctx.userName,
            status: post.status,
            scheduledAt: post.scheduledAt?.toISOString() ?? null,
        },
        'Post deleted',
    );

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
export async function handlePatchPost(ctx: HandlerContext, body: PatchPostBody) {
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

    if (action === 'duplicate') {
        return handleDuplicate(ctx, ctx.id, scheduledAt);
    }

    if (action === 'mark_published') {
        return handleMarkPublished(ctx, post);
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/** Transform a post for the GET response */
function transformPost(post: PostWithRelations) {
    /**
     * Why: socialAccountId can be null if the linked SocialAccount was deleted
     * (onDelete:SetNull). Return empty arrays so the composer shows no platform
     * selected instead of crashing on [null].
     */
    const platformAccountIds = post.socialAccountId ? [post.socialAccountId] : [];
    const platforms = post.socialAccountId && post.platform ? [{
        accountId: post.socialAccountId,
        platform: post.platform.toLowerCase(),
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
        tiktokPrivacyLevel: post.tiktokPrivacyLevel,
        tiktokContentDisclosure: post.tiktokContentDisclosure,
        tiktokBrandOrganic: post.tiktokBrandOrganic, tiktokBrandContent: post.tiktokBrandContent,
        tiktokIsAigc: post.tiktokIsAigc, tiktokComments: post.tiktokComments,
        tiktokDuets: post.tiktokDuets, tiktokStitches: post.tiktokStitches,
        instagramShareToFeed: post.instagramShareToFeed, instagramComments: post.instagramComments, isTrialReel: post.isTrialReel,
        // Why (BUG-36/37): Include new platform fields in GET response
        youtubeCommentsEnabled: post.youtubeCommentsEnabled,
        linkedinVisibility: post.linkedinVisibility,
        altText: post.altText,
        threadsTopicTag: post.threadsTopicTag,
        threadsQuotePostId: post.threadsQuotePostId,
        notifyDeviceIds: post.notifyDeviceIds,
        productTags: post.productTags?.map((pt) => ({
            id: pt.id,
            platformProductId: pt.platformProductId,
            productName: pt.productName,
            productPrice: pt.productPrice,
            productCurrency: pt.productCurrency,
            productImageUrl: pt.productImageUrl,
            mediaIndex: pt.mediaIndex,
            positionX: pt.positionX,
            positionY: pt.positionY,
            product: pt.product,
        })),
    }] : [];

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
        // Why: platformMetrics stores platform-specific data (Reels skip rate,
        // watch time, Threads quotes/reposts, Story taps/exits). Previously
        // this was stored in DB but never serialized to the client.
        platformMetrics: post.analytics.platformMetrics || null,
        syncedAt: post.analytics.syncedAt?.toISOString() || null,
    } : null;

    return { analyticsData, platformAccountIds, platforms };
}



/** Update a post inside a transaction */
async function updatePost(tx: TransactionClient, id: string, existing: PostWithRelations, opts: UpdatePostOptions) {
    /**
     * Why: socialAccountId can be null after account deletion (onDelete:SetNull).
     * Fall back to the first key from parsedPlatformSettings so per-platform
     * settings (postType, TikTok toggles, etc.) are still applied on save.
     */
    const settingsKey = existing.socialAccountId || Object.keys(opts.parsedPlatformSettings)[0] || '';
    const acctSettings = opts.parsedPlatformSettings[settingsKey] || {};
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
            autoPublish: acctSettings.autoPublish !== undefined ? acctSettings.autoPublish : opts.effectiveAutoPublish,
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
            // Why (BUG-36): Persist YouTube comments toggle on update
            youtubeCommentsEnabled: acctSettings.youtubeCommentsEnabled ?? existing.youtubeCommentsEnabled,
            // Why (BUG-37): Persist LinkedIn visibility on update
            linkedinVisibility: acctSettings.linkedinVisibility !== undefined ? (acctSettings.linkedinVisibility || null) : existing.linkedinVisibility,
            altText: acctSettings.altText !== undefined ? (acctSettings.altText || null) : existing.altText,
            threadsTopicTag: acctSettings.threadsTopicTag !== undefined ? (acctSettings.threadsTopicTag || null) : existing.threadsTopicTag,
            threadsQuotePostId: acctSettings.threadsQuotePostId !== undefined ? (acctSettings.threadsQuotePostId || null) : existing.threadsQuotePostId,
            createFirstLike: acctSettings.createFirstLike ?? existing.createFirstLike,
            embeddable: acctSettings.embeddable ?? existing.embeddable,
            notifySubscribers: acctSettings.notifySubscribers ?? existing.notifySubscribers,
            madeForKids: acctSettings.madeForKids ?? existing.madeForKids,
            tiktokPrivacyLevel: acctSettings.tiktokPrivacyLevel !== undefined ? (acctSettings.tiktokPrivacyLevel || null) : existing.tiktokPrivacyLevel,
            tiktokContentDisclosure: acctSettings.tiktokContentDisclosure ?? existing.tiktokContentDisclosure,
            tiktokBrandOrganic: acctSettings.tiktokBrandOrganic ?? existing.tiktokBrandOrganic,
            tiktokBrandContent: acctSettings.tiktokBrandContent ?? existing.tiktokBrandContent,
            tiktokIsAigc: acctSettings.tiktokIsAigc ?? existing.tiktokIsAigc,
            tiktokComments: acctSettings.tiktokComments ?? existing.tiktokComments,
            tiktokDuets: acctSettings.tiktokDuets ?? existing.tiktokDuets,
            tiktokStitches: acctSettings.tiktokStitches ?? existing.tiktokStitches,
            instagramShareToFeed: acctSettings.instagramShareToFeed ?? existing.instagramShareToFeed,
            instagramComments: acctSettings.instagramComments ?? existing.instagramComments,
            isTrialReel: acctSettings.isTrialReel ?? existing.isTrialReel,
            notifyDeviceIds: acctSettings.notifyDeviceIds ?? existing.notifyDeviceIds,
        },
    });

    // Why (BUG-FIX): Previously `[]` (empty array) was truthy, causing all PostMedia
    // records to be deleted without creating replacements — silently stripping media.
    if (opts.mediaIds && Array.isArray(opts.mediaIds) && opts.mediaIds.length > 0) {
        await tx.postMedia.deleteMany({ where: { postId: id } });
        for (let i = 0; i < opts.mediaIds.length; i++) {
            await tx.postMedia.create({ data: { postId: id, mediaId: opts.mediaIds[i], order: i } });
        }
    }

    if (acctSettings.productTags !== undefined) {
        await tx.productTag.deleteMany({ where: { postId: id } });
        if (Array.isArray(acctSettings.productTags) && acctSettings.productTags.length > 0) {
            for (const pt of acctSettings.productTags) {
                await tx.productTag.create({
                    data: {
                        postId: id,
                        platformProductId: pt.platformProductId,
                        productName: pt.productName,
                        mediaIndex: pt.mediaIndex,
                        positionX: pt.positionX,
                        positionY: pt.positionY
                    }
                });
            }
        }
    }

    return post;
}



/** Handle scheduling changes after a PUT */
async function handleSchedulingChanges(
    postId: string,
    organizationId: string,
    existing: SchedulingExisting,
    opts: { newScheduledAt: Date | null; autoPublish: boolean; hasFutureSchedule: boolean; caption: string; platform: string },
) {
    const scheduledAtChanged = existing.scheduledAt?.getTime() !== opts.newScheduledAt?.getTime();
    const autoPublishChanged = opts.autoPublish !== existing.autoPublish;

    // Why (BUG-29): Previously returned early when scheduledAt didn't change
    // AND autoPublish was false. This meant toggling autoPublish from true→false
    // without changing the schedule left the old BullMQ auto-publish job alive.
    // Now we also proceed when autoPublish itself changed.
    if (!scheduledAtChanged && !autoPublishChanged && opts.autoPublish !== true) return;

    try {
        if (existing.status === 'SCHEDULED') {
            await cancelPublishReminder(postId);
            // Why (BUG-42): Previously called cancelScheduledPost() which
            // unconditionally resets DB status to DRAFT, clobbering the
            // status set by reschedulePost() moments later. Instead, remove
            // BullMQ jobs directly — matching reschedulePost's own pattern.
            if (existing.autoPublish) {
                try {
                    const { postPublishQueue } = await import('@/lib/bullmq/queues');
                    const jobs = await postPublishQueue.getJobs(['delayed', 'waiting']);
                    for (const job of jobs) {
                        if (job.data.postId === postId) {
                            await job.remove();
                            logger.info({ postId, jobId: job.id }, 'Removed old auto-publish job during schedule change');
                        }
                    }
                } catch (err: unknown) {
                    logger.warn({ postId, err }, 'Failed to remove existing auto-publish jobs');
                }
            }
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
async function handleReschedule(ctx: HandlerContext, post: SchedulingExisting & { caption: string }, scheduledAt: string | undefined) {
    if (!scheduledAt) {
        return NextResponse.json({ error: 'scheduledAt is required for reschedule' }, { status: 400 });
    }

    if (post.status !== 'DRAFT' && post.status !== 'SCHEDULED' && post.status !== 'FAILED') {
        return NextResponse.json({ error: `Cannot reschedule post in ${post.status} status` }, { status: 400 });
    }

    // Why (BUG-41): PUT and duplicate both guard against past dates (BUG-31, BUG-35),
    // but reschedule didn't. A past scheduledAt causes BullMQ delay=0, triggering
    // an immediate publish without user intent.
    const newDate = new Date(scheduledAt);
    const gracePeriodMs = 30_000;
    if (newDate.getTime() < Date.now() - gracePeriodMs) {
        return NextResponse.json({ error: 'Scheduled time must be in the future' }, { status: 400 });
    }

    try {
        const result = await reschedulePost(ctx.id, ctx.organizationId, newDate);

        await db.activity.create({
            data: {
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                userName: ctx.userName,
                action: 'rescheduled',
                resourceType: 'post',
                resourceId: ctx.id,
                resourceName: sanitizeForDb(post.caption, 50),
                /** Why (HT06): toISOString() is deterministic across server locales */
                details: sanitizeForDb(`Rescheduled to ${newDate.toISOString()}`),
            }
        });

        logger.info({ postId: ctx.id, newScheduledAt: newDate, jobId: result.jobId }, 'Post rescheduled via calendar');

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
async function handleRetry(ctx: HandlerContext, post: SchedulingExisting) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const isStuckPublishing = post.status === 'PUBLISHING' && (post.updatedAt ?? new Date(0)) < fiveMinutesAgo;

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

/**
 * Handle the mark_published action from PATCH.
 * Why: Manual-publish posts ("Remind to Post" platforms) stay in SCHEDULED status
 * until the user confirms they've posted by clicking "Open {Platform}" on the
 * publish-ready page. This handler transitions the post to PUBLISHED.
 */
async function handleMarkPublished(ctx: HandlerContext, post: SchedulingExisting & { caption: string }) {
    if (post.status === 'PUBLISHED') {
        return NextResponse.json({ id: ctx.id, status: 'published', alreadyPublished: true });
    }

    if (post.status !== 'SCHEDULED') {
        return NextResponse.json(
            { error: `Cannot mark post as published from ${post.status} status` },
            { status: 400 },
        );
    }

    await db.post.update({
        where: { id: ctx.id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
    });

    // Why: The reminder BullMQ job may still be queued if the user opened
    // the publish-ready page before the scheduled time fired.
    await cancelPublishReminder(ctx.id).catch((err: unknown) => {
        logger.warn({ postId: ctx.id, err }, 'Failed to cancel publish reminder after mark_published');
    });

    await db.activity.create({
        data: {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            userName: ctx.userName,
            action: 'published',
            resourceType: 'post',
            resourceId: ctx.id,
            resourceName: sanitizeForDb(post.caption, 50),
            details: 'Manually published via publish-ready page',
        },
    });

    logger.info({ postId: ctx.id, organizationId: ctx.organizationId }, 'Post marked as published via manual flow');

    invalidatePostCaches(ctx.organizationId);

    return NextResponse.json({ id: ctx.id, status: 'published', publishedAt: new Date().toISOString() });
}

/** Handle the duplicate action from PATCH */
async function handleDuplicate(ctx: HandlerContext, id: string, scheduledAt: string | undefined) {
    if (!scheduledAt) {
        return NextResponse.json({ error: 'scheduledAt is required for duplicate' }, { status: 400 });
    }

    const existing = await db.post.findUnique({
        where: { id },
        include: { media: true, hashtags: true }
    });

    if (!existing || existing.organizationId !== ctx.organizationId) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    try {
        const newDate = new Date(scheduledAt);

        // Why (BUG-35): POST and PUT routes reject past dates, but duplicate didn't.
        // A past scheduledAt causes BullMQ delay=0, triggering immediate publish.
        const gracePeriodMs = 30_000;
        if (newDate.getTime() < Date.now() - gracePeriodMs) {
            return NextResponse.json(
                { error: 'Scheduled time must be in the future' },
                { status: 400 }
            );
        }

        // Why (BUG-40): Previously reverted to DRAFT for PUBLISHED/FAILED posts,
        // but the scheduling logic at line 816 only fires for SCHEDULED posts,
        // so the copy was abandoned with a scheduledAt but no BullMQ job.
        // Since the user explicitly provides a scheduledAt, the intent is SCHEDULED.
        const statusForCopy = 'SCHEDULED';

        /**
         * Why: socialAccountId can be null if the original account was deleted
         * (onDelete:SetNull). Resolve a replacement account so the copy isn't
         * born orphaned — the user would otherwise have to manually re-select.
         */
        let resolvedAccountId = existing.socialAccountId;
        if (!resolvedAccountId && existing.platform) {
            const replacement = await db.socialAccount.findFirst({
                where: { organizationId: existing.organizationId, platform: existing.platform },
                select: { id: true },
            });
            resolvedAccountId = replacement?.id ?? null;
        }

        const newPost = await db.post.create({
            data: {
                organizationId: existing.organizationId,
                caption: existing.caption,
                status: statusForCopy,
                scheduledAt: newDate,
                autoPublish: existing.autoPublish,
                firstComment: existing.firstComment,
                pillarId: existing.pillarId,
                platform: existing.platform,
                socialAccountId: resolvedAccountId,
                postType: existing.postType,
                callToAction: existing.callToAction,
                pinTitle: existing.pinTitle,
                pinLink: existing.pinLink,
                boardId: existing.boardId,
                location: existing.location,
                videoTitle: existing.videoTitle,
                youtubeCategory: existing.youtubeCategory,
                youtubePlaylist: existing.youtubePlaylist,
                videoTags: existing.videoTags,
                createFirstLike: existing.createFirstLike,
                embeddable: existing.embeddable,
                notifySubscribers: existing.notifySubscribers,
                madeForKids: existing.madeForKids,
                youtubePrivacy: existing.youtubePrivacy,
                tiktokPrivacyLevel: existing.tiktokPrivacyLevel,
                tiktokBrandOrganic: existing.tiktokBrandOrganic,
                tiktokBrandContent: existing.tiktokBrandContent,
                tiktokIsAigc: existing.tiktokIsAigc,
                tiktokComments: existing.tiktokComments,
                tiktokDuets: existing.tiktokDuets,
                tiktokStitches: existing.tiktokStitches,
                instagramShareToFeed: existing.instagramShareToFeed,
                instagramComments: existing.instagramComments,
                isTrialReel: existing.isTrialReel,
                youtubeCommentsEnabled: existing.youtubeCommentsEnabled,
                linkedinVisibility: existing.linkedinVisibility,
                altText: existing.altText,
                threadsTopicTag: existing.threadsTopicTag,
                threadsQuotePostId: existing.threadsQuotePostId,
                customMediaIds: existing.customMediaIds,
                // Media
                media: existing.media.length ? {
                    create: existing.media.map(m => ({ mediaId: m.mediaId, order: m.order }))
                } : undefined,
                // Hashtags
                hashtags: existing.hashtags.length ? {
                    create: existing.hashtags.map(h => ({ hashtagId: h.hashtagId }))
                } : undefined
            }
        });

        // Why (BUG-27): Increment hashtag usageCount for the duplicated post.
        // The POST route increments on creation, and the DELETE handler decrements.
        // Without this, deleting a duplicated post drives usageCount negative.
        for (const h of existing.hashtags) {
            await db.hashtag.update({
                where: { id: h.hashtagId },
                data: { usageCount: { increment: 1 } },
            }).catch(() => { /* Hashtag may have been deleted */ });
        }

        // Activity log
        await db.activity.create({
            data: {
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                userName: ctx.userName,
                action: 'created',
                resourceType: 'post',
                resourceId: newPost.id,
                resourceName: sanitizeForDb(newPost.caption || 'Copied post', 50),
                details: sanitizeForDb(`Duplicated to ${newDate.toISOString()}`),
            }
        });

        // Queue auto-publisher or schedule reminder
        if (newPost.status === 'SCHEDULED' && newPost.autoPublish) {
            await schedulePost(newPost.id, newPost.organizationId, {
                datetime: newDate,
                timezone: 'UTC',
                platforms: []
            });
        } else if (newPost.status === 'SCHEDULED' && !newPost.autoPublish) {
            // Why (BUG-28): Non-auto-publish duplicated posts need a reminder
            // notification so the user is prompted to publish manually.
            await schedulePublishReminder(
                newPost.id, newPost.organizationId,
                newPost.caption || '', newPost.platform || 'unknown', newDate
            );
        }

        invalidatePostCaches(ctx.organizationId);

        return NextResponse.json({
            id: newPost.id,
            scheduledAt: newPost.scheduledAt?.toISOString(),
            status: newPost.status.toLowerCase(),
            updatedAt: newPost.updatedAt.toISOString(),
        });

    } catch (error) {
        logger.error({ postId: ctx.id, error }, 'Failed to duplicate post');
        return NextResponse.json({ error: sanitizeError(error, 'Failed to duplicate post') }, { status: 500 });
    }
}
