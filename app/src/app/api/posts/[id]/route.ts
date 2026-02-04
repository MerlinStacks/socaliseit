/**
 * Single Post API Routes
 * GET, PUT, DELETE, PATCH for individual posts
 * 
 * Why: Provides CRUD operations for post management with real database integration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reschedulePost, cancelScheduledPost, retryFailedPost } from '@/lib/queue';
import { logger } from '@/lib/logger';

/**
 * GET /api/posts/[id] - Get single post with all relations
 * Why: Needed for edit mode in compose page to load existing post data
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

    // Transform for frontend consumption
    // Aggregate analytics across all platforms for the performance panel
    const analyticsData = post.platforms.reduce((acc, pp) => {
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
            // Track latest sync time
            if (pp.analytics.syncedAt && (!acc.syncedAt || pp.analytics.syncedAt > acc.syncedAt)) {
                acc.syncedAt = pp.analytics.syncedAt;
            }
            // Only include avgWatchPercentage if we have video data
            if (pp.analytics.avgWatchPercentage != null) {
                acc.avgWatchPercentageSum += pp.analytics.avgWatchPercentage;
                acc.avgWatchPercentageCount += 1;
            }
            acc.hasData = true;
        }
        return acc;
    }, {
        impressions: 0,
        reach: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        clicks: 0,
        videoViews: 0,
        videoWatchTime: 0,
        avgWatchPercentageSum: 0,
        avgWatchPercentageCount: 0,
        syncedAt: null as Date | null,
        hasData: false
    });

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
        // Return account IDs for the compose page to select
        platformAccountIds: post.platforms.map(pp => pp.socialAccountId),
        // Full platform details for display
        platforms: post.platforms.map(pp => ({
            accountId: pp.socialAccountId,
            platform: pp.socialAccount.platform.toLowerCase(),
            name: pp.socialAccount.name,
            username: pp.socialAccount.username,
            avatar: pp.socialAccount.avatar,
            postType: pp.postType.toLowerCase(),
            callToAction: pp.callToAction,
            captionOverride: pp.caption,
            customMediaIds: pp.customMediaIds,
            firstComment: pp.firstComment,
        })),
        media: post.media.map(pm => ({
            id: pm.media.id,
            url: pm.media.url,
            thumbnailUrl: pm.media.thumbnailUrl,
            type: pm.media.mimeType.startsWith('video/') ? 'video' : 'image',
            size: pm.media.size,
        })),
        hashtags: post.hashtags.map(ph => ph.hashtag.tag),
        // Analytics data for published posts
        analytics: analyticsData.hasData ? {
            impressions: analyticsData.impressions,
            reach: analyticsData.reach,
            likes: analyticsData.likes,
            comments: analyticsData.comments,
            shares: analyticsData.shares,
            saves: analyticsData.saves,
            clicks: analyticsData.clicks,
            videoViews: analyticsData.videoViews,
            videoWatchTime: analyticsData.videoWatchTime,
            avgWatchPercentage: analyticsData.avgWatchPercentageCount > 0
                ? analyticsData.avgWatchPercentageSum / analyticsData.avgWatchPercentageCount
                : null,
            syncedAt: analyticsData.syncedAt?.toISOString() || null,
        } : null,
    };

    return NextResponse.json(transformedPost);
}

/**
 * PUT /api/posts/[id] - Full update of post
 * Why: Handles edit mode from compose page, updating all post data including platforms and media
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
    const body = await request.json();

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

    const {
        caption,
        scheduledAt,
        pillarId,
        firstComment,
        platformAccountIds,
        mediaIds,
        platformSettings,
        autoPublish,
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
        // Update main post
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
            // Delete existing platform relations
            await tx.postPlatform.deleteMany({ where: { postId: id } });

            // Create new platform relations
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
            // Delete existing media relations
            await tx.postMedia.deleteMany({ where: { postId: id } });

            // Create new media relations
            for (let i = 0; i < mediaIds.length; i++) {
                await tx.postMedia.create({
                    data: {
                        postId: id,
                        mediaId: mediaIds[i],
                        order: i,
                    },
                });
            }
        }

        return post;
    });

    // Handle scheduling changes
    const scheduledAtChanged = existing.scheduledAt?.getTime() !== newScheduledAt?.getTime();

    if (scheduledAtChanged || autoPublish === true) {
        try {
            // Cancel existing scheduled job if any
            if (existing.status === 'SCHEDULED') {
                await cancelScheduledPost(id);
            }

            // Schedule new job
            if (autoPublish === true) {
                const { publishNow } = await import('@/lib/queue');
                await publishNow(id, organizationId);
                logger.info({ postId: id }, 'Post queued for immediate publishing after edit');
            } else if (newScheduledAt) {
                await reschedulePost(id, organizationId, newScheduledAt);
                logger.info({ postId: id, scheduledAt: newScheduledAt }, 'Post rescheduled after edit');
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

    logger.info({ postId: id, organizationId }, 'Post updated via edit');

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

    // Cancel any scheduled jobs
    if (post.status === 'SCHEDULED') {
        try {
            await cancelScheduledPost(id);
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
            resourceName: post.caption.slice(0, 50) + (post.caption.length > 50 ? '...' : ''),
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
    const body = await request.json();

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
                    resourceName: post.caption.slice(0, 50) + (post.caption.length > 50 ? '...' : ''),
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
                { error: error instanceof Error ? error.message : 'Failed to reschedule post' },
                { status: 500 }
            );
        }
    }

    // Handle retry action for failed posts
    if (action === 'retry') {
        if (post.status !== 'FAILED') {
            return NextResponse.json(
                { error: 'Can only retry posts in FAILED status' },
                { status: 400 }
            );
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
                    resourceName: post.caption.slice(0, 50) + (post.caption.length > 50 ? '...' : ''),
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
                { error: error instanceof Error ? error.message : 'Failed to retry post' },
                { status: 500 }
            );
        }
    }

    return NextResponse.json(
        { error: `Unknown action: ${action}` },
        { status: 400 }
    );
}
