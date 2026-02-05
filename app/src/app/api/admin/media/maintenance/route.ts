/**
 * Admin Media Maintenance API
 * Endpoints for managing media maintenance tasks like thumbnail regeneration
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { withSuperAdmin } from '@/lib/admin/middleware';
import { triggerThumbnailRegeneration } from '@/lib/bullmq/queues';

/**
 * GET /api/admin/media/maintenance
 * Get status of videos missing thumbnails
 */
export const GET = withSuperAdmin(async () => {
    const [
        totalVideos,
        videosWithoutThumbnails,
    ] = await Promise.all([
        db.media.count({
            where: { mimeType: { startsWith: 'video/' } },
        }),
        db.media.count({
            where: {
                mimeType: { startsWith: 'video/' },
                thumbnailUrl: null,
            },
        }),
    ]);

    return NextResponse.json({
        status: 'ok',
        stats: {
            totalVideos,
            videosWithoutThumbnails,
            videosWithThumbnails: totalVideos - videosWithoutThumbnails,
        },
    });
});

/**
 * POST /api/admin/media/maintenance
 * Trigger thumbnail regeneration
 * Body: { mediaId?: string } - If provided, regenerate only for this media
 */
export const POST = withSuperAdmin(async (request: NextRequest) => {
    const body = await request.json().catch(() => ({}));
    const { mediaId } = body as { mediaId?: string };

    // Validate media ID if provided
    if (mediaId) {
        const media = await db.media.findUnique({
            where: { id: mediaId },
            select: { id: true, mimeType: true, thumbnailUrl: true },
        });

        if (!media) {
            return NextResponse.json(
                { error: 'Media not found' },
                { status: 404 }
            );
        }

        if (!media.mimeType.startsWith('video/')) {
            return NextResponse.json(
                { error: 'Only video media can have thumbnails regenerated' },
                { status: 400 }
            );
        }
    }

    // Trigger regeneration job
    const jobId = await triggerThumbnailRegeneration(mediaId);

    return NextResponse.json({
        success: true,
        message: mediaId
            ? `Thumbnail regeneration queued for media ${mediaId}`
            : 'Thumbnail regeneration queued for all videos missing thumbnails',
        jobId,
    });
});
