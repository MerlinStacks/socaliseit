/**
 * Video Transcode API Route
 * Why: Provides an endpoint for transcoding videos to platform-specific formats
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import path from 'path';
import {
    transcodeVideo,
    getPresetForPlatform,
    isFFmpegAvailable,
    getVideoMetadata,
    needsTranscoding,
    TRANSCODE_PRESETS,
    type TranscodePreset,
} from '@/lib/services/video-transcode';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
const TRANSCODED_DIR = path.join(process.cwd(), 'public', 'uploads', 'transcoded');

/**
 * POST /api/video/transcode
 * Transcode a video to a specific platform format
 * Body: { mediaId: string, platform: string, postType: string } or { preset: TranscodePreset }
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check if organization has video processing enabled
        const org = await db.organization.findUnique({
            where: { id: session.user.currentOrganizationId },
            select: { videoProcessingEnabled: true },
        });

        if (!org?.videoProcessingEnabled) {
            return NextResponse.json({
                error: 'Video processing is not enabled for this organization',
                hint: 'Enable it in Settings > Video Processing',
            }, { status: 403 });
        }

        // Check FFmpeg availability
        if (!(await isFFmpegAvailable())) {
            return NextResponse.json({
                error: 'Video processing is unavailable',
                hint: 'FFmpeg is not installed on the server',
            }, { status: 503 });
        }

        const body = await request.json();
        const { mediaId, platform, postType, preset: explicitPreset } = body;

        if (!mediaId) {
            return NextResponse.json({ error: 'mediaId is required' }, { status: 400 });
        }

        // Fetch media item
        const media = await db.media.findFirst({
            where: {
                id: mediaId,
                organizationId: session.user.currentOrganizationId,
            },
        });

        if (!media) {
            return NextResponse.json({ error: 'Media not found' }, { status: 404 });
        }

        if (!media.mimeType.startsWith('video/')) {
            return NextResponse.json({ error: 'Media is not a video' }, { status: 400 });
        }

        // Determine preset
        const preset: TranscodePreset = explicitPreset ||
            (platform && postType ? getPresetForPlatform(platform, postType) : 'FEED_PORTRAIT');

        if (!(preset in TRANSCODE_PRESETS)) {
            return NextResponse.json({ error: `Invalid preset: ${preset}` }, { status: 400 });
        }

        // Get input path from URL
        const inputPath = path.join(UPLOAD_DIR, path.basename(media.url));

        // Check if transcoding is needed
        const metadata = await getVideoMetadata(inputPath);
        if (metadata && !needsTranscoding(metadata, preset)) {
            return NextResponse.json({
                success: true,
                skipped: true,
                message: 'Video already meets requirements',
                url: media.url,
                metadata,
            });
        }

        // Perform transcoding
        const result = await transcodeVideo({
            inputPath,
            outputDir: TRANSCODED_DIR,
            preset,
        });

        if (!result.success) {
            return NextResponse.json({
                error: 'Transcoding failed',
                details: result.error,
            }, { status: 500 });
        }

        // Update media record with transcoded version (optional, or create new record)
        // For now, return the transcoded URL without modifying the original
        return NextResponse.json({
            success: true,
            skipped: false,
            url: result.outputUrl,
            originalUrl: media.url,
            preset,
            metadata: result.metadata,
        });

    } catch (error) {
        logger.error({ error }, 'Video transcode API error');
        return NextResponse.json({ error: 'Failed to process video' }, { status: 500 });
    }
}

/**
 * GET /api/video/transcode
 * Check transcoding capabilities and requirements
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const ffmpegAvailable = await isFFmpegAvailable();

        const org = await db.organization.findUnique({
            where: { id: session.user.currentOrganizationId },
            select: { videoProcessingEnabled: true },
        });

        return NextResponse.json({
            available: ffmpegAvailable && (org?.videoProcessingEnabled ?? false),
            ffmpegInstalled: ffmpegAvailable,
            enabled: org?.videoProcessingEnabled ?? false,
            presets: Object.keys(TRANSCODE_PRESETS),
        });

    } catch (error) {
        logger.error({ error }, 'Video transcode status check failed');
        return NextResponse.json({ error: 'Failed to check status' }, { status: 500 });
    }
}
