/**
 * Single Post API Routes
 * GET, PUT, DELETE, PATCH for individual posts
 * 
 * Why: Provides CRUD operations for post management with real database integration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reschedulePost, cancelScheduledPost } from '@/lib/queue';
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
    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const workspaceId = session.user.currentWorkspaceId;

    const post = await db.post.findUnique({
        where: { id },
        include: {
            pillar: { select: { id: true, name: true, color: true } },
            platforms: {
                include: {
                    socialAccount: {
                        select: { id: true, platform: true, name: true, username: true, avatar: true }
                    }
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
    if (post.workspaceId !== workspaceId) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Transform for frontend consumption
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
    };

    return NextResponse.json(transformedPost);
}

/**
 * PUT /api/posts/[id] - Full update of post
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const workspaceId = session.user.currentWorkspaceId;
    const body = await request.json();

    // Verify post exists and belongs to workspace
    const existing = await db.post.findUnique({ where: { id } });
    if (!existing || existing.workspaceId !== workspaceId) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (existing.status === 'PUBLISHED') {
        return NextResponse.json({ error: 'Cannot update published posts' }, { status: 400 });
    }

    const { caption, scheduledAt, pillarId, firstComment } = body;

    const updatedPost = await db.post.update({
        where: { id },
        data: {
            caption,
            scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
            pillarId: pillarId || null,
            firstComment: firstComment || null,
            updatedAt: new Date(),
        },
    });

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
    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const workspaceId = session.user.currentWorkspaceId;
    const userId = session.user.id;
    const userName = session.user.name || 'Unknown';

    // Verify post exists and belongs to workspace
    const post = await db.post.findUnique({ where: { id } });
    if (!post || post.workspaceId !== workspaceId) {
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
            workspaceId,
            userId,
            userName,
            action: 'deleted',
            resourceType: 'post',
            resourceId: id,
            resourceName: post.caption.slice(0, 50) + (post.caption.length > 50 ? '...' : ''),
        }
    });

    logger.info({ postId: id, workspaceId }, 'Post deleted');

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
    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const workspaceId = session.user.currentWorkspaceId;
    const userId = session.user.id;
    const userName = session.user.name || 'Unknown';
    const body = await request.json();

    const { action, scheduledAt } = body;

    // Verify post exists and belongs to workspace
    const post = await db.post.findUnique({ where: { id } });
    if (!post || post.workspaceId !== workspaceId) {
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

        // Only allow rescheduling DRAFT or SCHEDULED posts
        if (post.status !== 'DRAFT' && post.status !== 'SCHEDULED') {
            return NextResponse.json(
                { error: `Cannot reschedule post in ${post.status} status` },
                { status: 400 }
            );
        }

        try {
            // Use queue utility to cancel old job and create new one
            const result = await reschedulePost(id, workspaceId, new Date(scheduledAt));

            // Log activity
            await db.activity.create({
                data: {
                    workspaceId,
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

    return NextResponse.json(
        { error: `Unknown action: ${action}` },
        { status: 400 }
    );
}
