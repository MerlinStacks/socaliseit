import { db } from '@/lib/db';
import { schedulePost, publishNow, schedulePublishReminder } from '@/lib/queue';
import { logger } from '@/lib/logger';
import crypto from 'crypto';
import { sanitizeForDb } from '@/lib/sanitize-string';
import { type PlatformSettingsInput } from '@/types/platform-settings';
import { findDuplicatePlatforms, findScheduleConflict, formatScheduleConflictError } from '@/lib/schedule-conflicts';

export interface CreatePostParams {
    organizationId: string;
    userId: string;
    userName: string;
    caption?: string;
    platformAccountIds: string[];
    mediaIds?: string[];
    scheduledAt?: string | null;
    pillarId?: string | null;
    hashtags?: string[];
    autoPublish?: boolean;
    firstComment?: string;
    platformSettings?: Record<string, PlatformSettingsInput>;
}

export interface CreatedPostInfo {
    id: string;
    caption: string | null;
    status: string;
    scheduledAt: string | null;
    createdAt: string;
    platform?: string;
    linkedGroupId: string | null;
}

export interface CreatePostResult {
    status: number;
    error?: string;
    posts?: CreatedPostInfo[];
    linkedGroupId?: string | null;
    count?: number;
}

export async function createPosts(params: CreatePostParams): Promise<CreatePostResult> {
    const {
        organizationId,
        userId,
        userName,
        caption,
        platformAccountIds,
        mediaIds,
        scheduledAt,
        pillarId,
        hashtags,
        autoPublish,
        firstComment,
        platformSettings,
    } = params;

    const parsedPlatformSettings: Record<string, PlatformSettingsInput> =
        platformSettings && typeof platformSettings === 'object' ? platformSettings : {};

    const allPlatformsAreStories = platformAccountIds.every((accountId: string) => {
        const settings = parsedPlatformSettings[accountId] || {};
        return settings.postType?.toUpperCase() === 'STORY';
    });

    const allNonStoriesHaveCaptions = platformAccountIds
        .filter((id: string) => parsedPlatformSettings[id]?.postType?.toUpperCase() !== 'STORY')
        .every((id: string) => parsedPlatformSettings[id]?.caption?.trim());

    const isAutoPublish = autoPublish === true;
    if (isAutoPublish && !allPlatformsAreStories && !allNonStoriesHaveCaptions && (!caption || typeof caption !== 'string' || caption.trim() === '')) {
        return { status: 400, error: 'Caption is required' };
    }

    if (!platformAccountIds || !Array.isArray(platformAccountIds) || platformAccountIds.length === 0) {
        return { status: 400, error: 'At least one platform account is required' };
    }

    const socialAccounts = await db.socialAccount.findMany({
        where: { id: { in: platformAccountIds }, organizationId },
        select: { id: true, platform: true },
    });

    if (socialAccounts.length !== platformAccountIds.length) {
        return { status: 400, error: 'One or more platform accounts not found' };
    }

    const { validatePostContent } = await import('@/lib/validate-post');
    const effectiveCaption = caption || '';
    const validationErrors: string[] = [];
    for (const account of socialAccounts) {
        const platformKey = account.platform.toLowerCase() as Parameters<typeof validatePostContent>[0];
        const perPlatformCaption = parsedPlatformSettings[account.id]?.caption || effectiveCaption;
        const result = validatePostContent(platformKey, {
            caption: perPlatformCaption,
            mediaCount: mediaIds?.length,
            postType: parsedPlatformSettings[account.id]?.postType,
        });
        if (!result.valid) {
            validationErrors.push(...result.errors);
        }
    }
    if (validationErrors.length > 0) {
        return { status: 400, error: validationErrors.join('; ') };
    }

    if (pillarId) {
        const pillar = await db.contentPillar.findUnique({
            where: { id: pillarId },
            select: { organizationId: true },
        });
        if (!pillar || pillar.organizationId !== organizationId) {
            return { status: 400, error: 'Content pillar not found' };
        }
    }

    if (scheduledAt) {
        const scheduledDate = new Date(scheduledAt);
        const gracePeriodMs = 30_000;
        if (scheduledDate.getTime() < Date.now() - gracePeriodMs) {
            return { status: 400, error: 'Scheduled time must be in the future' };
        }

        const duplicatePlatforms = findDuplicatePlatforms(socialAccounts.map(account => account.platform));
        if (duplicatePlatforms.length > 0) {
            return {
                status: 409,
                error: `Multiple ${duplicatePlatforms[0].toLowerCase()} posts cannot be scheduled for the same time`,
            };
        }

        const conflict = await findScheduleConflict({
            organizationId,
            platforms: socialAccounts.map(account => account.platform),
            scheduledAt: scheduledDate,
        });
        if (conflict) {
            return { status: 409, error: formatScheduleConflictError(conflict) };
        }
    }

    const hashtagRecords: { id: string }[] = [];
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

    const linkedGroupId = platformAccountIds.length > 1 ? crypto.randomUUID() : null;

    // Why (BUG-FIX): Use allSettled so partial creation doesn't throw
    // and orphan already-committed posts. Failures are reported back.
    const settledResults = await Promise.allSettled(
        socialAccounts.map(async (account) => {
            const settings = parsedPlatformSettings[account.id] || {};
            const postCaption = settings.caption || caption || '';
            const postFirstComment = settings.firstComment || firstComment || null;
            const postMediaIds = settings.mediaIds || mediaIds || [];

            const platformAutoPublish = settings.autoPublish !== undefined ? settings.autoPublish : (autoPublish === true);

            const post = await db.post.create({
                data: {
                    organizationId,
                    caption: postCaption,
                    // Why (BUG-FIX): When autoPublish=true but no scheduledAt, status should
                    // be PUBLISHING (handled by publishNow below), not SCHEDULED.
                    // Using SCHEDULED here as a transitional state — the publishNow
                    // queue handler will move it to PUBLISHING immediately.
                    status: scheduledAt ? 'SCHEDULED' : (platformAutoPublish ? 'SCHEDULED' : 'DRAFT'),
                    // Note: The 'SCHEDULED' status for immediate publish is intentional —
                    // publishNow() transitions it to PUBLISHING when the job runs.
                    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
                    autoPublish: platformAutoPublish,
                    firstComment: postFirstComment,
                    pillarId: pillarId || null,
                    platform: account.platform,
                    socialAccountId: account.id,
                    postType: (settings.postType?.toUpperCase() as 'FEED' | 'REEL' | 'STORY' | 'CAROUSEL' | 'PIN' | 'VIDEO' | 'ARTICLE' | 'THREAD') || 'FEED',
                    callToAction: settings.callToAction || null,
                    pinTitle: settings.pinTitle || null,
                    pinLink: settings.pinLink || null,
                    boardId: settings.boardId || null,
                    location: settings.location || null,
                    videoTitle: settings.videoTitle || null,
                    youtubeCategory: settings.youtubeCategory || null,
                    youtubePlaylist: settings.youtubePlaylist || null,
                    videoTags: settings.videoTags || [],
                    createFirstLike: settings.createFirstLike ?? false,
                    embeddable: settings.embeddable ?? true,
                    notifySubscribers: settings.notifySubscribers ?? true,
                    madeForKids: settings.madeForKids ?? false,
                    youtubePrivacy: settings.youtubePrivacy || null,
                    youtubeCommentsEnabled: settings.youtubeCommentsEnabled ?? true,
                    linkedinVisibility: settings.linkedinVisibility || null,
                    altText: settings.altText || null,
                    threadsTopicTag: settings.threadsTopicTag || null,
                    threadsQuotePostId: settings.threadsQuotePostId || null,
                    tiktokPrivacyLevel: settings.tiktokPrivacyLevel || null,
                    tiktokContentDisclosure: settings.tiktokContentDisclosure ?? false,
                    tiktokBrandOrganic: settings.tiktokBrandOrganic ?? false,
                    tiktokBrandContent: settings.tiktokBrandContent ?? false,
                    tiktokIsAigc: settings.tiktokIsAigc ?? false,
                    tiktokComments: settings.tiktokComments ?? true,
                    tiktokDuets: settings.tiktokDuets ?? true,
                    tiktokStitches: settings.tiktokStitches ?? true,
                    instagramShareToFeed: settings.instagramShareToFeed ?? true,
                    instagramComments: settings.instagramComments ?? true,
                    isTrialReel: settings.isTrialReel ?? false,
                    customMediaIds: postMediaIds,
                    linkedGroupId,
                    notifyDeviceIds: settings.notifyDeviceIds || [],
                    media: postMediaIds.length ? {
                        create: postMediaIds.map((mediaId: string, index: number) => ({
                            mediaId,
                            order: index
                        }))
                    } : undefined,
                    productTags: settings.productTags?.length ? {
                        create: settings.productTags.map(pt => ({
                            platformProductId: pt.platformProductId,
                            productName: pt.productName,
                            mediaIndex: pt.mediaIndex,
                            positionX: pt.positionX,
                            positionY: pt.positionY
                        }))
                    } : undefined,
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

            // Log activity for each post
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

            return post;
        })
    );

    const createdPosts = settledResults
        .filter((r): r is PromiseFulfilledResult<typeof settledResults[0] extends PromiseSettledResult<infer T> ? T : never> => r.status === 'fulfilled')
        .map(r => r.value);
    const failedCount = settledResults.filter(r => r.status === 'rejected').length;

    if (createdPosts.length === 0 && failedCount > 0) {
        logger.error({ failedCount }, 'All post creations failed');
        return { status: 500, error: 'Failed to create posts' };
    }
    if (failedCount > 0) {
        logger.warn({ createdCount: createdPosts.length, failedCount }, 'Partial post creation failure');
    }

    for (const post of createdPosts) {
        try {
            // Why (BUG-AUDIT-3): Use per-post autoPublish (set from per-account
            // settings on line 146) instead of the top-level param. This
            // respects per-account overrides (e.g. user disables auto-publish
            // for one specific account).
            if (post.autoPublish && scheduledAt) {
                const result = await schedulePost(post.id, organizationId, {
                    datetime: new Date(scheduledAt),
                    timezone: 'UTC',
                    platforms: [],
                });
                logger.info({ postId: post.id, jobId: result.jobId, scheduledAt }, 'Post scheduled for auto-publishing');
            } else if (post.autoPublish) {
                const result = await publishNow(post.id, organizationId);
                logger.info({ postId: post.id, jobId: result.jobId }, 'Post queued for immediate publishing');
            } else if (scheduledAt) {
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
            if (post.status === 'SCHEDULED') {
                await db.post.update({
                    where: { id: post.id },
                    data: { status: 'DRAFT' },
                }).catch((dbErr) => {
                    // Why (BUG-AUDIT-10): Log so the failure is observable
                    logger.error({ postId: post.id, err: dbErr }, 'Failed to reset post to DRAFT after queue error');
                });
            }
        }
    }

    const { invalidatePostCaches } = await import('@/lib/cache');
    invalidatePostCaches(organizationId);

    return {
        status: 201,
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
    };
}
