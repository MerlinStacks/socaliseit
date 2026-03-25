/**
 * GET /api/media/[id]/transcode-status
 * Returns the transcoding status and progress for a media item.
 * Why: The compose UI polls this endpoint to show a real-time progress bar
 * while the video-transcode worker runs FFmpeg in the background.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getRedisConnection } from '@/lib/bullmq/connection';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await auth();
    if (!session?.user?.id || !session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Fetch media record with org isolation
    const media = await db.media.findFirst({
        where: {
            id,
            organizationId: session.user.currentOrganizationId,
        },
        select: {
            transcodeStatus: true,
            transcodedUrl: true,
        },
    });

    if (!media) {
        return NextResponse.json({ error: 'Media not found' }, { status: 404 });
    }

    // Read real-time progress from Redis (only meaningful when processing)
    let progress = 0;
    if (media.transcodeStatus === 'processing' || media.transcodeStatus === 'pending') {
        try {
            const redis = getRedisConnection();
            const cached = await redis.get(`transcode:progress:${id}`);
            if (cached) {
                progress = parseInt(cached, 10);
            }
        } catch {
            // Redis unavailable -- return 0 progress, not an error
        }
    } else if (media.transcodeStatus === 'completed') {
        progress = 100;
    }

    return NextResponse.json({
        status: media.transcodeStatus,
        progress,
        transcodedUrl: media.transcodedUrl,
    });
}
