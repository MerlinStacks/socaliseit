/**
 * Media Resize API Route
 * Why: Auto-resizes images to platform-recommended dimensions so uploads
 * meet each platform's size requirements without manual intervention.
 * Creates a new Media record for the resized copy — the original is untouched.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { logger } from '@/lib/logger';
import { getImageResizePlan } from '@/lib/image-resize-policy';
import { PLATFORM_SPECS, type Platform } from '@/lib/platform-config';

export const dynamic = 'force-dynamic';

interface ResizeRequestBody {
    sourceMediaId: string;
    targetWidth: number;
    platform: string;
    postType: string;
    focalPoint?: { x: number; y: number };
}

/**
 * POST /api/media/resize
 * Resizes a source image to a target width, saves the result as a new Media record.
 * Skips resize if the source is already within the target bounds.
 */
export async function POST(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.id || !session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const organizationId = session.user.currentOrganizationId;

    let body: ResizeRequestBody;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { sourceMediaId, targetWidth, platform, postType, focalPoint } = body ?? {};

    if (typeof sourceMediaId !== 'string' || !sourceMediaId || !Number.isFinite(targetWidth) || targetWidth <= 0
        || typeof platform !== 'string' || !Object.hasOwn(PLATFORM_SPECS, platform) || typeof postType !== 'string' || !postType
        || (focalPoint !== undefined && (!focalPoint || !Number.isFinite(focalPoint.x) || !Number.isFinite(focalPoint.y)
            || focalPoint.x < 0 || focalPoint.x > 100 || focalPoint.y < 0 || focalPoint.y > 100))) {
        return NextResponse.json(
            { error: 'Missing required fields: sourceMediaId, targetWidth, platform, postType' },
            { status: 400 },
        );
    }

    // Fetch source media record
    const sourceMedia = await db.media.findFirst({
        where: { id: sourceMediaId, organizationId },
    });

    if (!sourceMedia) {
        return NextResponse.json({ error: 'Source media not found' }, { status: 404 });
    }

    if (!sourceMedia.mimeType.startsWith('image/')) {
        return NextResponse.json({ error: 'Only images can be resized' }, { status: 400 });
    }

    // Resolve source file path
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    const sourceFilename = path.basename(sourceMedia.url.replace('/api/uploads/', ''));
    const sourcePath = path.join(uploadsDir, sourceFilename);

    try {
        await fs.access(sourcePath);
    } catch {
        return NextResponse.json({ error: 'Source file not found on disk' }, { status: 404 });
    }

    try {
        // Read source file and get metadata
        const sourceBuffer = await fs.readFile(sourcePath);
        const metadata = await sharp(sourceBuffer).metadata();
        // Do not flatten animated images into a single frame.
        if ((metadata.pages ?? 1) > 1) {
            return NextResponse.json({ skipped: true });
        }
        const swapsAxes = (metadata.orientation ?? 1) >= 5;
        const originalWidth = (swapsAxes ? metadata.height : metadata.width) ?? 0;
        const originalHeight = (swapsAxes ? metadata.width : metadata.height) ?? 0;
        const plan = getImageResizePlan(originalWidth, originalHeight, platform as Platform, postType, focalPoint);
        if (!plan) return NextResponse.json({ skipped: true });

        // Determine output format
        // Why: WebP → JPEG is the safe default since Google Business, Instagram,
        // Facebook, and Pinterest all prefer JPG/PNG. WebP → PNG produces unnecessarily large files.
        const ext = path.extname(sourceFilename).toLowerCase();
        const isJpeg = ['.jpg', '.jpeg', '.webp'].includes(ext);
        const outputFormat = isJpeg ? 'jpeg' as const : 'png' as const;
        const outputMime = isJpeg ? 'image/jpeg' : 'image/png';
        const outputExt = isJpeg ? '.jpg' : '.png';

        // Orient first, crop around the focal point, then downscale without distortion.
        // Keep the original file untouched and normalize the derivative to sRGB.
        let pipeline = sharp(sourceBuffer)
            .rotate()
            .toColorspace('srgb');
        if (plan.extract) pipeline = pipeline.extract(plan.extract);
        const resizedBuffer = await pipeline
            .resize(plan.width, plan.height, { fit: 'inside', withoutEnlargement: true })
            .toFormat(outputFormat, { quality: 95, ...(outputFormat === 'jpeg' ? { progressive: true } : {}) })
            .toBuffer();

        // Save resized file
        const resizedFilename = `resized-${randomUUID()}${outputExt}`;
        const resizedPath = path.join(uploadsDir, resizedFilename);
        await fs.writeFile(resizedPath, resizedBuffer);

        // Read actual output dimensions from sharp (fit: 'inside' calculates height automatically)
        const resizedMeta = await sharp(resizedBuffer).metadata();
        const actualWidth = resizedMeta.width ?? plan.width;
        const actualHeight = resizedMeta.height ?? plan.height;

        // Create new Media record with auto-resized tag
        const resizedMedia = await db.media.create({
            data: {
                organizationId,
                filename: `resized-${sourceMedia.filename}`,
                mimeType: outputMime,
                size: resizedBuffer.length,
                width: actualWidth,
                height: actualHeight,
                url: `/api/uploads/${resizedFilename}`,
                thumbnailUrl: `/api/uploads/${resizedFilename}`,
                tags: ['auto-resized', platform, postType],
                aiTags: [],
                // Duplicate grouping: link back to the original
                sourceMediaId: sourceMediaId,
                contentHash: sourceMedia.contentHash,
            },
        });

        logger.info({
            sourceId: sourceMediaId,
            resizedId: resizedMedia.id,
            from: `${originalWidth}x${originalHeight}`,
            to: `${actualWidth}x${actualHeight}`,
            platform,
            postType,
        }, 'Image auto-resized');

        return NextResponse.json({
            skipped: false,
            media: {
                id: resizedMedia.id,
                url: resizedMedia.url,
                thumbnailUrl: resizedMedia.thumbnailUrl,
                width: resizedMedia.width,
                height: resizedMedia.height,
                size: resizedMedia.size,
                filename: resizedMedia.filename,
                mimeType: resizedMedia.mimeType,
            },
            originalWidth,
            originalHeight,
        });
    } catch (err) {
        logger.error({ sourceMediaId, error: String(err) }, 'Image resize failed');
        return NextResponse.json(
            { error: 'Failed to resize image' },
            { status: 500 },
        );
    }
}
