/**
 * Single Post API Routes
 * GET, PUT, DELETE, PATCH for individual posts
 * 
 * Why: Provides CRUD operations for post management with real database integration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reschedulePost, cancelScheduledPost, retryFailedPost, schedulePublishReminder, cancelPublishReminder } from '@/lib/queue';
import { logger } from '@/lib/logger';
import { sanitizeError } from '@/lib/sanitize-error';

/**
 * GET /api/posts/[id] - Get single post with all relations
 * Why: Needed for edit mode in compose page to load existing post data
 * 
 * Handles both:
 * - NEW architecture: Post has platform/socialAccountId set directly
 * - LEGACY: Post uses PostPlatform relation
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const organizationId = session.user.currentOrganizationId;

    const post = await db.post.findUnique({
        where: { id },
        include: {
            pillar: { select: { id: true, name: true, color: true } },
            // NEW: Direct social account relation
            socialAccount: {
                select: { id: true, platform: true, name: true, username: true, avatar: true }
            },
            // NEW: Direct analytics relation
            analytics: true,
            // LEGACY: PostPlatform relation for old posts
            platforms: {
                include: {
                    socialAccount: {
                        select: { id: true, platform: true, name: true, username: true, avatar: true }
                    },
                    analytics: true
                }
            },
            media: {
                include: {
                    media: { select: { id: true, url: true, thumbnailUrl: true, mimeType: true, size: true } }
                },
                orderBy: { order: 'asc' }
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

    // Verify post belongs to user's workspace
    if (post.organizationId !== organizationId) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Determine if this is a new-architecture post (platform set directly)
    const isNewArchitecture = Boolean(post.platform && post.socialAccountId);

    // Transform for frontend consumption
    let analyticsData;
    let platformAccountIds: string[];
    let platforms: Array<{
        accountId: string;
        platform: string;
        name: string;
        username: string | null;
        avatar: string | null;
        status: string;
        postType: string;
        callToAction: string | null;
        captionOverride: string | null;
        customMediaIds: string[];
        firstComment: string | null;
    }>;

    if (isNewArchitecture) {
        // NEW ARCHITECTURE: Single platform, direct fields
        platformAccountIds = [post.socialAccountId!];
        platforms = [{
            accountId: post.socialAccountId!,
            platform: post.platform!.toLowerCase(),
            name: post.socialAccount?.name || 'Unknown',
            username: post.socialAccount?.username || null,
            avatar: post.socialAccount?.avatar || null,
            status: post.status.toLowerCase(),
            postType: post.postType.toLowerCase(),
            callToAction: post.callToAction,
            captionOverride: null, // Caption is already on Post
            customMediaIds: post.customMediaIds,
            firstComment: post.firstComment,
        }];

        // Analytics directly on Post
        analyticsData = post.analytics ? {
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
    } else {
        // LEGACY: Aggregate analytics across all platforms
        platformAccountIds = post.platforms.map(pp => pp.socialAccountId);
        platforms = post.platforms.map(pp => ({
            accountId: pp.socialAccountId,
            platform: pp.socialAccount.platform.toLowerCase(),
            name: pp.socialAccount.name,
            username: pp.socialAccount.username,
            avatar: pp.socialAccount.avatar,
            status: pp.status.toLowerCase(),
            postType: pp.postType.toLowerCase(),
            callToAction: pp.callToAction,
            captionOverride: pp.caption,
            customMediaIds: pp.customMediaIds,
            firstComment: pp.firstComment,
        }));

        const aggregated = post.platforms.reduce((acc, pp) => {
            if (pp.analytics) {
                acc.impressions += pp.analytics.impressions || 0;
                acc.reach += pp.analytics.reach || 0;
                acc.likes += pp.analytics.likes || 0;
                acc.comments += pp.analytics.comments || 0;
                acc.shares += pp.analytics.shares || 0;
                acc.saves += pp.analytics.saves || 0;
                acc.clicks += pp.analytics.clicks || 0;
                acc.videoViews += pp.analytics.videoViews || 0;
                acc.videoWatchTime += pp.analytics.videoWatchTime || 0;
                if (pp.analytics.syncedAt && (!acc.syncedAt || pp.analytics.syncedAt > acc.syncedAt)) {
                    acc.syncedAt = pp.analytics.syncedAt;
                }
                if (pp.analytics.avgWatchPercentage != null) {
                    acc.avgWatchPercentageSum += pp.analytics.avgWatchPercentage;
                    acc.avgWatchPercentageCount += 1;
                }
                acc.hasData = true;
            }
            return acc;
        }, {
            impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0,
            videoViews: 0, videoWatchTime: 0, avgWatchPercentageSum: 0, avgWatchPercentageCount: 0,
            syncedAt: null as Date | null, hasData: false
        });

        analyticsData = aggregated.hasData ? {
            impressions: aggregated.impressions,
            reach: aggregated.reach,
            likes: aggregated.likes,
            comments: aggregated.comments,
            shares: aggregated.shares,
            saves: aggregated.saves,
            clicks: aggregated.clicks,
            videoViews: aggregated.videoViews,
            videoWatchTime: aggregated.videoWatchTime,
            avgWatchPercentage: aggregated.avgWatchPercentageCount > 0
                ? aggregated.avgWatchPercentageSum / aggregated.avgWatchPercentageCount
                : null,
            syncedAt: aggregated.syncedAt?.toISOString() || null,
        } : null;
    }

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
        // NEW: Include architecture flag
        isNewArchitecture,
        linkedGroupId: post.linkedGroupId,
        // Return account IDs for the compose page to select
        platformAccountIds,
        // Full platform details for display
        platforms,
        media: post.media.map(pm => ({
            id: pm.media.id,
            url: pm.media.url,
            thumbnailUrl: pm.media.thumbnailUrl,
            type: pm.media.mimeType.startsWith('video/') ? 'video' : 'image',
            size: pm.media.size,
        })),
        hashtags: post.hashtags.map(ph => ph.hashtag.tag),
        // Analytics data for published posts
        analytics: analyticsData,
    };

    return NextResponse.json(transformedPost);
}

/**
 * PUT /api/posts/[id] - Full update of post
 * Why: Handles edit mode from compose page, updating all post data including platforms and media
 * 
 * Handles both:
 * - NEW architecture: Updates Post fields directly (caption, postType, etc.)
 * - LEGACY: Updates Post and PostPlatform relations
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const organizationId = session.user.currentOrganizationId;
    const userId = session.user.id;
    const userName = session.user.name || 'Unknown';
    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Verify post exists and belongs to workspace
    const existing = await db.post.findUnique({
        where: { id },
        include: { platforms: true }
    });
    if (!existing || existing.organizationId !== organizationId) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (existing.status === 'PUBLISHED') {
        return NextResponse.json({ error: 'Cannot update published posts' }, { status: 400 });
    }

    // Determine if this is a new-architecture post
    const isNewArchitecture = Boolean(existing.platform && existing.socialAccountId);

    const {
        caption,
        scheduledAt,
        pillarId,
        firstComment,
        platformAccountIds,
        mediaIds,
        platformSettings,
        autoPublish,
        postType,
        callToAction,
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

    // Determine new status
    const newScheduledAt = scheduledAt ? new Date(scheduledAt) : null;
    let newStatus = existing.status;
    if (autoPublish === true) {
        newStatus = 'PUBLISHING';
    } else if (newScheduledAt) {
        newStatus = 'SCHEDULED';
    } else {
        newStatus = 'DRAFT';
    }

    // Use transaction to update post and relations atomically
    const updatedPost = await db.$transaction(async (tx) => {
        if (isNewArchitecture) {
            // NEW ARCHITECTURE: Update Post directly (single platform)
            const post = await tx.post.update({
                where: { id },
                data: {
                    caption: caption ?? existing.caption,
                    scheduledAt: newScheduledAt,
                    status: newStatus,
                    pillarId: pillarId || null,
                    firstComment: firstComment ?? existing.firstComment ?? null,
                    autoPublish: autoPublish === true,
                    postType: postType ? (postType.toUpperCase() as 'FEED' | 'REEL' | 'STORY' | 'CAROUSEL' | 'PIN' | 'VIDEO' | 'ARTICLE' | 'THREAD') : existing.postType,
                    callToAction: callToAction !== undefined ? callToAction : existing.callToAction,
                    customMediaIds: mediaIds ?? existing.customMediaIds,
                    updatedAt: new Date(),
                },
            });

            // Update media relations if provided
            if (mediaIds && Array.isArray(mediaIds)) {
                await tx.postMedia.deleteMany({ where: { postId: id } });
                for (let i = 0; i < mediaIds.length; i++) {
                    await tx.postMedia.create({
                        data: { postId: id, mediaId: mediaIds[i], order: i },
                    });
                }
            }

            return post;
        } else {
            // LEGACY: Update Post and PostPlatform relations
            const post = await tx.post.update({
                where: { id },
                data: {
                    caption: caption ?? existing.caption,
                    scheduledAt: newScheduledAt,
                    status: newStatus,
                    pillarId: pillarId || null,
                    firstComment: firstComment || null,
                    autoPublish: autoPublish === true,
                    updatedAt: new Date(),
                },
            });

            // Update platforms if provided
            if (platformAccountIds && Array.isArray(platformAccountIds)) {
                await tx.postPlatform.deleteMany({ where: { postId: id } });
                for (const accountId of platformAccountIds) {
                    const settings = parsedPlatformSettings[accountId] || {};
                    await tx.postPlatform.create({
                        data: {
                            postId: id,
                            socialAccountId: accountId,
                            status: newStatus,
                            postType: (settings.postType?.toUpperCase() as 'FEED' | 'REEL' | 'STORY' | 'CAROUSEL' | 'PIN' | 'VIDEO' | 'ARTICLE' | 'THREAD') || 'FEED',
                            callToAction: settings.callToAction || null,
                            caption: settings.caption || null,
                            customMediaIds: settings.mediaIds || [],
                            firstComment: settings.firstComment || null,
                        },
                    });
                }
            }

            // Update media if provided
            if (mediaIds && Array.isArray(mediaIds)) {
                await tx.postMedia.deleteMany({ where: { postId: id } });
                for (let i = 0; i < mediaIds.length; i++) {
                    await tx.postMedia.create({
                        data: { postId: id, mediaId: mediaIds[i], order: i },
                    });
                }
            }

            return post;
        }
    });

    // Handle scheduling changes
    const scheduledAtChanged = existing.scheduledAt?.getTime() !== newScheduledAt?.getTime();

    if (scheduledAtChanged || autoPublish === true) {
        try {
            // Cancel existing scheduled job and reminder
            if (existing.status === 'SCHEDULED') {
                await cancelScheduledPost(id);
                await cancelPublishReminder(id);
            }

            // Schedule new job or reminder
            if (autoPublish === true) {
                const { publishNow } = await import('@/lib/queue');
                await publishNow(id, organizationId);
                logger.info({ postId: id }, 'Post queued for immediate publishing after edit');
            } else if (newScheduledAt) {
                // Non-auto-publish: schedule a notification reminder instead
                await schedulePublishReminder(
                    id,
                    organizationId,
                    caption || existing.caption,
                    existing.platform || 'unknown',
                    newScheduledAt
                );
                logger.info({ postId: id, scheduledAt: newScheduledAt }, 'Post reminder rescheduled after edit');
            }
        } catch (error) {
            logger.error({ postId: id, error }, 'Failed to update scheduled job after edit');
        }
    }

    // Log activity
    await db.activity.create({
        data: {
            organizationId,
            userId,
            userName,
            action: 'updated',
            resourceType: 'post',
            resourceId: id,
            resourceName: (caption || existing.caption).slice(0, 50) + ((caption || existing.caption).length > 50 ? '...' : ''),
        }
    });

    logger.info({ postId: id, organizationId, isNewArchitecture }, 'Post updated via edit');

    return NextResponse.json({
        id: updatedPost.id,
        caption: updatedPost.caption,
        status: updatedPost.status.toLowerCase(),
        scheduledAt: updatedPost.scheduledAt?.toISOString() || null,
        updatedAt: updatedPost.updatedAt.toISOString(),
    });
}

/**
 * DELETE /api/posts/[id] - Delete post and cancel any scheduled jobs
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const organizationId = session.user.currentOrganizationId;
    const userId = session.user.id;
    const userName = session.user.name || 'Unknown';

    // Verify post exists and belongs to workspace
    const post = await db.post.findUnique({ where: { id } });
    if (!post || post.organizationId !== organizationId) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Cancel any scheduled jobs and reminders
    if (post.status === 'SCHEDULED') {
        try {
            await cancelScheduledPost(id);
            await cancelPublishReminder(id);
        } catch (error) {
            logger.warn({ postId: id, error }, 'Failed to cancel scheduled job during delete');
        }
    }

    // Delete the post (cascade will handle relations)
    await db.post.delete({ where: { id } });

    // Log activity
    await db.activity.create({
        data: {
            organizationId,
            userId,
            userName,
            action: 'deleted',
            resourceType: 'post',
            resourceId: id,
            resourceName: (post.caption || '').slice(0, 50) + ((post.caption || '').length > 50 ? '...' : ''),
        }
    });

    logger.info({ postId: id, organizationId }, 'Post deleted');

    return NextResponse.json({ success: true, deletedId: id });
}

/**
 * PATCH /api/posts/[id] - Partial update (reschedule, status change)
 * Why: Handles calendar drag-drop reschedule action
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const organizationId = session.user.currentOrganizationId;
    const userId = session.user.id;
    const userName = session.user.name || 'Unknown';
    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { action, scheduledAt } = body;

    // Verify post exists and belongs to workspace
    const post = await db.post.findUnique({ where: { id } });
    if (!post || post.organizationId !== organizationId) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Handle reschedule action from calendar drag-drop
    if (action === 'reschedule') {
        if (!scheduledAt) {
            return NextResponse.json(
                { error: 'scheduledAt is required for reschedule' },
                { status: 400 }
            );
        }

        // Only allow rescheduling DRAFT, SCHEDULED, or FAILED posts
        if (post.status !== 'DRAFT' && post.status !== 'SCHEDULED' && post.status !== 'FAILED') {
            return NextResponse.json(
                { error: `Cannot reschedule post in ${post.status} status` },
                { status: 400 }
            );
        }

        try {
            // Use queue utility to cancel old job and create new one
            const result = await reschedulePost(id, organizationId, new Date(scheduledAt));

            // Log activity
            await db.activity.create({
                data: {
                    organizationId,
                    userId,
                    userName,
                    action: 'rescheduled',
                    resourceType: 'post',
                    resourceId: id,
                    resourceName: (post.caption || '').slice(0, 50) + ((post.caption || '').length > 50 ? '...' : ''),
                    details: `Rescheduled to ${new Date(scheduledAt).toLocaleString()}`,
                }
            });

            logger.info({ postId: id, newScheduledAt: scheduledAt, jobId: result.jobId }, 'Post rescheduled via calendar');

            return NextResponse.json({
                id,
                scheduledAt: result.scheduledAt.toISOString(),
                status: 'scheduled',
                updatedAt: new Date().toISOString(),
            });
        } catch (error) {
            logger.error({ postId: id, error }, 'Failed to reschedule post');
            return NextResponse.json(
                { error: sanitizeError(error, 'Failed to reschedule post') },
                { status: 500 }
            );
        }
    }

    // Handle retry action for failed posts
    if (action === 'retry') {
        // Allow retry for FAILED posts OR posts stuck in PUBLISHING for too long (> 5 min)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const isStuckPublishing = post.status === 'PUBLISHING' && post.updatedAt < fiveMinutesAgo;

        if (post.status !== 'FAILED' && post.status !== 'PUBLISHING') {
            return NextResponse.json(
                { error: 'Can only retry posts in FAILED or PUBLISHING status' },
                { status: 400 }
            );
        }

        // For a stuck PUBLISHING post, reset it to FAILED first
        if (post.status === 'PUBLISHING') {
            if (!isStuckPublishing) {
                return NextResponse.json(
                    { error: 'Post is currently being published. Please wait a few minutes before retrying.' },
                    { status: 400 }
                );
            }
            logger.info({ postId: id }, 'Resetting stuck PUBLISHING post to FAILED for retry');
            await db.post.update({
                where: { id },
                data: { status: 'FAILED' },
            });
        }

        try {
            const result = await retryFailedPost(id, organizationId);

            // Log activity
            await db.activity.create({
                data: {
                    organizationId,
                    userId,
                    userName,
                    action: 'retried',
                    resourceType: 'post',
                    resourceId: id,
                    resourceName: (post.caption || '').slice(0, 50) + ((post.caption || '').length > 50 ? '...' : ''),
                    details: 'Retrying failed post',
                }
            });

            logger.info({ postId: id, jobId: result.jobId }, 'Failed post retry queued');

            return NextResponse.json({
                id,
                status: 'publishing',
                jobId: result.jobId,
            });
        } catch (error) {
            logger.error({ postId: id, error }, 'Failed to retry post');
            return NextResponse.json(
                { error: sanitizeError(error, 'Failed to retry post') },
                { status: 500 }
            );
        }
    }

    return NextResponse.json(
        { error: `Unknown action: ${action}` },
        { status: 400 }
    );
}
