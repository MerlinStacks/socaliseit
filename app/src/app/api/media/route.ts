/**
 * Media API Routes
 * Upload, list, and delete media files with workspace isolation
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { Prisma } from '@/generated/prisma/client';
import { unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { generateVideoThumbnail } from '@/lib/media/thumbnail-generator';
import {
    getVideoMetadata,
    needsTranscoding,
    isFFmpegAvailable,
} from '@/lib/services/video-transcode';
import { videoTranscodeQueue } from '@/lib/bullmq/queues';
import { parseJsonBody } from '@/lib/parse-json-body';
import { checkRateLimit, createRateLimitHeaders, type RateLimitConfig } from '@/lib/rate-limit';
import { sanitizeError } from '@/lib/sanitize-error';
import { computeImageHash } from '@/lib/media/image-hash';
import sharp from 'sharp';

/** Media upload rate limit: 20 uploads per minute (higher than expensive ops) */
const MEDIA_UPLOAD_RATE_LIMIT: RateLimitConfig = {
    max: 20,
    windowSeconds: 60,
    prefix: 'ratelimit:media-upload',
};

/**
 * Route Segment Config
 * Why needed: Next.js default body size limit is 1MB, which is too small for video uploads.
 * 
 * Note: For App Router route handlers, we must disable the automatic body limit
 * by not consuming the body synchronously, or increase limits. The formData() call
 * streams the body, but the underlying infrastructure may still timeout.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 120; // Allow up to 120 seconds for large video file processing
export const fetchCache = 'force-no-store';

/**
 * Route Segment Body Size Config
 * Why: App Router route handlers don't use serverActions.bodySizeLimit.
 * This tells Next.js to use a streaming body parser without size limits.
 */
export const runtime = 'nodejs'; // Ensure we're using Node.js runtime for fs operations

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
const ALLOWED_TYPES = [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    // Why: iPhone photos are often HEIC/HEIF — accept them for auto-conversion to JPEG
    'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime',
    'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/x-m4a', 'audio/mp4'
];
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

/**
 * GET /api/media
 * List media files for the current workspace
 * Supports filtering by folder, type, search, and pagination
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const folderId = searchParams.get('folderId');
        const type = searchParams.get('type'); // 'image' | 'video' | 'all'
        const usage = searchParams.get('usage'); // 'used' | 'unused' | 'all'
        const search = searchParams.get('search');
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);

        // Build where clause with workspace isolation
        const where: Prisma.MediaWhereInput = {
            organizationId: session.user.currentOrganizationId,
        };

        // Folder filter: null means root (unfiled), undefined means all
        if (folderId === 'root') {
            where.folderId = null;
        } else if (folderId) {
            where.folderId = folderId;
        }

        // Type filter
        if (type === 'image') {
            where.mimeType = { startsWith: 'image/' };
        } else if (type === 'video') {
            where.mimeType = { startsWith: 'video/' };
        } else if (type === 'audio') {
            where.mimeType = { startsWith: 'audio/' };
        }

        // Search filter
        if (search) {
            where.OR = [
                { filename: { contains: search, mode: 'insensitive' } },
                { tags: { has: search.toLowerCase() } },
            ];
        }

        const baseWhere = { ...where };

        // Usage filter: filter by whether media has been used in posts
        if (usage === 'used') {
            where.posts = { some: {} };
        } else if (usage === 'unused') {
            where.posts = { none: {} };
        }

        const [media, total, usedCount, unusedCount] = await Promise.all([
            db.media.findMany({
                where,
                include: {
                    folder: { select: { id: true, name: true, color: true } },
                    _count: { select: { posts: true, variants: true } }
                },
                orderBy: { createdAt: 'desc' },
                // limit=0 means no pagination — return all items
                ...(limit > 0 ? { take: limit, skip: offset } : {}),
            }),
            db.media.count({ where }),
            db.media.count({ where: { ...baseWhere, posts: { some: {} } } }),
            db.media.count({ where: { ...baseWhere, posts: { none: {} } } }),
        ]);

        // ── Lazy Hash Backfill ───────────────────────────────────────
        // Why: Existing images uploaded before the hash feature have no contentHash.
        // Instead of requiring a manual backfill, we compute hashes in the background
        // as users browse the media library. Fire-and-forget — doesn't block response.
        const unhashed = media.filter((m: { contentHash: string | null; mimeType: string }) =>
            !m.contentHash && m.mimeType.startsWith('image/')
        );
        if (unhashed.length > 0) {
            const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');
            Promise.allSettled(
                unhashed.map(async (m: { id: string; url: string }) => {
                    const filename = path.basename(m.url.replace('/api/uploads/', ''));
                    const filePath = path.join(UPLOADS_DIR, filename);
                    const hash = await computeImageHash(filePath);
                    if (hash) {
                        await db.media.update({ where: { id: m.id }, data: { contentHash: hash } });
                    }
                })
            ).catch(() => { /* non-critical background task */ });
        }

        return NextResponse.json({
            media: media.map((m: { id: string; filename: string; url: string; transcodedUrl: string | null; thumbnailUrl: string | null; mimeType: string; size: number; width: number | null; height: number | null; duration: number | null; tags: string[]; contentHash: string | null; sourceMediaId: string | null; transcodeStatus: string | null; createdAt: Date; folder: { id: string; name: string; color: string } | null; _count: { posts: number; variants: number } }) => ({
                id: m.id,
                filename: m.filename,
                url: m.url,
                transcodedUrl: m.transcodedUrl,
                thumbnailUrl: m.thumbnailUrl,
                type: m.mimeType.startsWith('video/') ? 'video' : m.mimeType.startsWith('audio/') ? 'audio' : 'image',
                mimeType: m.mimeType,
                size: m.size,
                dimensions: m.width && m.height ? { width: m.width, height: m.height } : null,
                duration: m.duration,
                tags: m.tags,
                folder: m.folder,
                createdAt: m.createdAt.toISOString(),
                usageCount: m._count.posts,
                transcodeStatus: m.transcodeStatus,
                // Duplicate grouping
                contentHash: m.contentHash,
                sourceMediaId: m.sourceMediaId,
                variantCount: m._count.variants,
                isVariant: !!m.sourceMediaId,
            })),
            total,
            usageCounts: {
                used: usedCount,
                unused: unusedCount,
            },
            limit,
            offset,
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch media');
        return NextResponse.json({ error: 'Failed to fetch media' }, { status: 500 });
    }
}

/**
 * POST /api/media
 * Upload a new media file
 */
export async function POST(request: NextRequest) {
    logger.debug('POST /api/media - Started');
    try {
        const session = await auth();
        logger.debug({
            userId: session?.user?.id,
            organizationId: session?.user?.currentOrganizationId
        }, 'POST /api/media - Auth completed');

        if (!session?.user?.id || !session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        logger.debug('POST /api/media - Parsing FormData...');

        // Rate limit: 20 uploads per minute
        const rateLimitResult = await checkRateLimit(
            `${session.user.id}:media-upload`, MEDIA_UPLOAD_RATE_LIMIT
        );
        if (!rateLimitResult.allowed) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please try again later.' },
                { status: 429, headers: createRateLimitHeaders(rateLimitResult) }
            );
        }

        let formData;
        try {
            formData = await request.formData();
        } catch (e) {
            logger.error({ error: e }, 'POST /api/media - FormData parsing failed');
            throw new Error(`Failed to parse upload data: ${e instanceof Error ? e.message : String(e)}`);
        }

        const file = formData.get('file') as File | null;
        const folderId = formData.get('folderId') as string | null;
        const tagsRaw = formData.get('tags') as string | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Log file details for debugging
        logger.debug({
            name: file.name,
            type: file.type,
            size: file.size,
        }, 'Upload attempt');

        // Validate file type - handle empty/missing mime type
        let mimeType = file.type;
        if (!mimeType) {
            // Infer mime type from extension as fallback
            const ext = path.extname(file.name).toLowerCase();
            const mimeMap: Record<string, string> = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.webp': 'image/webp',
                '.gif': 'image/gif',
                '.mp4': 'video/mp4',
                '.mov': 'video/quicktime',
                '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav',
                '.m4a': 'audio/x-m4a',
                '.aac': 'audio/aac',
            };
            mimeType = mimeMap[ext] || '';
            logger.debug(`Inferred mime type from extension ${ext}: ${mimeType}`);
        }

        if (!mimeType || !ALLOWED_TYPES.includes(mimeType)) {
            return NextResponse.json(
                { error: `Invalid file type '${mimeType || 'unknown'}'. Allowed: ${ALLOWED_TYPES.join(', ')}` },
                { status: 400 }
            );
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: 'File too large. Maximum 100MB allowed.' },
                { status: 400 }
            );
        }

        // Validate folder belongs to workspace if provided
        if (folderId) {
            const folder = await db.mediaFolder.findFirst({
                where: { id: folderId, organizationId: session.user.currentOrganizationId },
            });
            if (!folder) {
                return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
            }
        }

        // Ensure upload directory exists
        if (!existsSync(UPLOAD_DIR)) {
            await mkdir(UPLOAD_DIR, { recursive: true });
        }

        // Generate unique filename to prevent collisions
        const ext = path.extname(file.name);
        const uniqueName = `${randomUUID()}${ext}`;
        const filePath = path.join(UPLOAD_DIR, uniqueName);

        // Write file to disk using streams to handle large files efficiently
        // Why: arrayBuffer() loads entire file into memory which can cause OOM for large videos
        const fileStream = file.stream();
        const writeStream = (await import('fs')).createWriteStream(filePath);

        // Convert Web ReadableStream to Node.js stream via async iteration
        const reader = fileStream.getReader();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // Write chunk and handle backpressure
                const canContinue = writeStream.write(value);
                if (!canContinue) {
                    await new Promise<void>((resolve) => writeStream.once('drain', resolve));
                }
            }
        } finally {
            reader.releaseLock();
            writeStream.end();
            await new Promise<void>((resolve, reject) => {
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
            });
        }

        // ── Image Optimization Pipeline ──────────────────────────────
        // Why: Processes all images through a single sharp pass for:
        // 1. HEIC/HEIF → JPEG (iPhone photos — most platforms don't accept HEIC)
        // 2. EXIF orientation fix (prevents sideways/upside-down images)
        // 3. sRGB color space (prevents washed-out colors when platforms strip ICC profiles)
        // 4. Progressive JPEG (faster perceived loading in previews)
        // 5. Dimension extraction (needed by auto-resize hook)
        let imageWidth: number | null = null;
        let imageHeight: number | null = null;
        let optimizedFilePath = filePath;
        let optimizedUniqueName = uniqueName;
        let optimizedMimeType = mimeType;
        let optimizedSize = file.size;

        if (mimeType.startsWith('image/') && mimeType !== 'image/gif') {
            try {
                const isHeic = mimeType === 'image/heic' || mimeType === 'image/heif';
                const isJpeg = isHeic || mimeType === 'image/jpeg' || mimeType === 'image/webp';
                const outputFormat = isJpeg ? 'jpeg' as const : 'png' as const;

                // Build sharp pipeline:
                // .rotate() — auto-rotates based on EXIF orientation, then strips EXIF
                // .toColorspace('srgb') — normalizes Display P3 / Adobe RGB to web-safe sRGB
                // .toFormat() — progressive: true for JPEG, quality 95 to preserve detail
                let pipeline = sharp(filePath)
                    .rotate()
                    .toColorspace('srgb');

                if (outputFormat === 'jpeg') {
                    pipeline = pipeline.toFormat('jpeg', { quality: 95, progressive: true });
                } else {
                    pipeline = pipeline.toFormat('png');
                }

                const optimizedBuffer = await pipeline.toBuffer({ resolveWithObject: true });

                imageWidth = optimizedBuffer.info.width;
                imageHeight = optimizedBuffer.info.height;

                // If format changed (e.g., HEIC → JPEG), update filename and mime type
                if (isHeic) {
                    const newExt = '.jpg';
                    optimizedUniqueName = uniqueName.replace(/\.[^.]+$/, newExt);
                    optimizedFilePath = path.join(UPLOAD_DIR, optimizedUniqueName);
                    optimizedMimeType = 'image/jpeg';
                }

                // Write optimized image back to disk
                const { writeFile: writeFileAsync } = await import('fs/promises');
                await writeFileAsync(optimizedFilePath, optimizedBuffer.data);
                optimizedSize = optimizedBuffer.data.length;

                // Clean up original HEIC file if we created a new JPEG
                if (isHeic && optimizedFilePath !== filePath) {
                    try { await unlink(filePath); } catch { /* ignore */ }
                }

                logger.debug({
                    originalFormat: mimeType,
                    outputFormat,
                    isHeic,
                    width: imageWidth,
                    height: imageHeight,
                    originalSize: file.size,
                    optimizedSize,
                }, 'Image optimized (EXIF rotation, sRGB, progressive JPEG)');
            } catch (optimizeError) {
                // Fallback: just extract dimensions without optimization
                logger.warn({ error: optimizeError, filePath }, 'Image optimization failed, using original');
                try {
                    const meta = await sharp(filePath).metadata();
                    imageWidth = meta.width ?? null;
                    imageHeight = meta.height ?? null;
                } catch { /* dimensions unavailable */ }
            }
        } else if (mimeType === 'image/gif') {
            // GIFs: extract dimensions only, don't re-encode (would lose animation)
            try {
                const meta = await sharp(filePath).metadata();
                imageWidth = meta.width ?? null;
                imageHeight = meta.height ?? null;
            } catch { /* dimensions unavailable */ }
        }

        // Parse tags
        const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) : [];

        // Generate thumbnail URL
        // Why: Videos need a separate thumbnail image; images can use themselves
        let thumbnailUrl: string | null = null;
        if (optimizedMimeType.startsWith('image/')) {
            thumbnailUrl = `/api/uploads/${optimizedUniqueName}`;
        } else if (optimizedMimeType.startsWith('video/')) {
            // Extract frame from video using FFmpeg
            const baseName = optimizedUniqueName.replace(path.extname(optimizedUniqueName), '');
            thumbnailUrl = await generateVideoThumbnail(optimizedFilePath, baseName);
        }

        // ── Async Video Transcoding ───────────────────────────────────
        // Why: Instead of blocking the upload response while FFmpeg runs,
        // we enqueue a BullMQ job and return immediately. The worker
        // transcodes in the background and reports progress via Redis.
        let transcodeStatus: string | null = null;
        let videoMetadata: { codec: string; width: number; height: number; duration: number } | null = null;
        if (optimizedMimeType.startsWith('video/') && await isFFmpegAvailable()) {
            try {
                const metadata = await getVideoMetadata(optimizedFilePath);
                const forceTranscode = optimizedMimeType === 'video/quicktime' || path.extname(optimizedUniqueName).toLowerCase() === '.mov';
                if (metadata && (forceTranscode || needsTranscoding(metadata, 'UPLOAD_GENERIC'))) {
                    transcodeStatus = 'pending';
                    videoMetadata = metadata;
                    logger.info(
                        { codec: metadata.codec, width: metadata.width, height: metadata.height, forceTranscode },
                        '[Media Upload] Video needs H.264 transcoding, will enqueue async job',
                    );
                }
            } catch (transcodeError) {
                logger.warn(
                    { error: transcodeError instanceof Error ? transcodeError.message : String(transcodeError) },
                    '[Media Upload] Failed to check transcode need, video stored as-is',
                );
            }
        }

        // ── Compute Perceptual Hash ─────────────────────────────────
        // Why: Generates a content fingerprint for duplicate detection.
        // Two images that are resized versions of each other produce identical hashes.
        // Only computed for images; videos return null by design.
        let contentHash: string | null = null;
        if (optimizedMimeType.startsWith('image/')) {
            contentHash = await computeImageHash(optimizedFilePath);
        }

        // Create database record
        const mediaItem = await db.media.create({
            data: {
                organizationId: session.user.currentOrganizationId,
                folderId: folderId || null,
                filename: file.name,
                mimeType: optimizedMimeType,
                size: optimizedSize,
                width: imageWidth,
                height: imageHeight,
                url: `/api/uploads/${optimizedUniqueName}`,
                thumbnailUrl,
                transcodeStatus,
                tags,
                contentHash,
            },
            include: { folder: { select: { id: true, name: true, color: true } } },
        });

        // Enqueue async transcode job after DB record exists
        if (transcodeStatus === 'pending' && videoMetadata) {
            try {
                await videoTranscodeQueue.add('transcode', {
                    mediaId: mediaItem.id,
                    inputPath: optimizedFilePath,
                    outputDir: path.join(UPLOAD_DIR, 'transcoded'),
                    preset: 'UPLOAD_GENERIC',
                    organizationId: session.user.currentOrganizationId,
                    duration: videoMetadata.duration,
                    forceTranscode: optimizedMimeType === 'video/quicktime' || path.extname(optimizedUniqueName).toLowerCase() === '.mov',
                }, { jobId: `transcode-${mediaItem.id}` });
                logger.info(
                    { mediaId: mediaItem.id, codec: videoMetadata.codec },
                    '[Media Upload] Transcode job enqueued',
                );
            } catch (queueError) {
                logger.warn(
                    { error: queueError instanceof Error ? queueError.message : String(queueError) },
                    '[Media Upload] Failed to enqueue transcode job, video stored as-is',
                );
                // Reset status so the video isn't stuck in "pending"
                await db.media.update({
                    where: { id: mediaItem.id },
                    data: { transcodeStatus: null },
                });
            }
        }

        return NextResponse.json({
            id: mediaItem.id,
            filename: mediaItem.filename,
            url: mediaItem.url,
            transcodedUrl: mediaItem.transcodedUrl,
            thumbnailUrl: mediaItem.thumbnailUrl,
            type: mediaItem.mimeType.startsWith('video/') ? 'video' : mediaItem.mimeType.startsWith('audio/') ? 'audio' : 'image',
            mimeType: mediaItem.mimeType,
            size: mediaItem.size,
            dimensions: mediaItem.width && mediaItem.height ? { width: mediaItem.width, height: mediaItem.height } : null,
            tags: mediaItem.tags,
            folder: mediaItem.folder,
            transcodeStatus,
            createdAt: mediaItem.createdAt.toISOString(),
        }, { status: 201 });
    } catch (error) {
        logger.error({ error }, 'Failed to upload media');
        // Return more specific error message if available
        const errorMessage = sanitizeError(error, 'Failed to upload media');
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}

/**
 * PATCH /api/media
 * Update media metadata (filename, tags, folder)
 * Body: { id: string, filename?: string, tags?: string[], folderId?: string | null }
 */
export async function PATCH(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: body, error: parseError } = await parseJsonBody<{ id?: string; filename?: string; tags?: string[]; folderId?: string | null }>(request);
        if (parseError) return parseError;
        const { id, filename, tags, folderId } = body;

        if (!id) {
            return NextResponse.json({ error: 'Media ID is required' }, { status: 400 });
        }

        // Verify media belongs to current workspace
        const existingMedia = await db.media.findFirst({
            where: {
                id,
                organizationId: session.user.currentOrganizationId,
            },
        });

        if (!existingMedia) {
            return NextResponse.json({ error: 'Media not found' }, { status: 404 });
        }

        // Build update data
        const updateData: Record<string, unknown> = {};

        if (filename !== undefined) {
            if (typeof filename !== 'string' || filename.trim().length === 0) {
                return NextResponse.json({ error: 'Filename cannot be empty' }, { status: 400 });
            }
            updateData.filename = filename.trim();
        }

        if (tags !== undefined) {
            if (!Array.isArray(tags)) {
                return NextResponse.json({ error: 'Tags must be an array' }, { status: 400 });
            }
            updateData.tags = tags.map((t: string) => String(t).trim().toLowerCase()).filter(Boolean);
        }

        // Handle folder assignment (null = unfiled, string = folder ID)
        if (folderId !== undefined) {
            if (folderId === null || folderId === '') {
                updateData.folderId = null;
            } else {
                // Validate folder belongs to workspace
                const folder = await db.mediaFolder.findFirst({
                    where: { id: folderId, organizationId: session.user.currentOrganizationId },
                });
                if (!folder) {
                    return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
                }
                updateData.folderId = folderId;
            }
        }

        // Update media record
        const updatedMedia = await db.media.update({
            where: { id },
            data: updateData,
            include: { folder: { select: { id: true, name: true, color: true } } },
        });

        return NextResponse.json({
            id: updatedMedia.id,
            filename: updatedMedia.filename,
            url: updatedMedia.url,
            transcodedUrl: updatedMedia.transcodedUrl,
            thumbnailUrl: updatedMedia.thumbnailUrl,
            type: updatedMedia.mimeType.startsWith('video/') ? 'video' : 'image',
            mimeType: updatedMedia.mimeType,
            size: updatedMedia.size,
            dimensions: updatedMedia.width && updatedMedia.height
                ? { width: updatedMedia.width, height: updatedMedia.height }
                : null,
            duration: updatedMedia.duration,
            tags: updatedMedia.tags,
            folder: updatedMedia.folder,
            createdAt: updatedMedia.createdAt.toISOString(),
        });
    } catch (error) {
        logger.error({ error }, 'Failed to update media');
        return NextResponse.json({ error: 'Failed to update media' }, { status: 500 });
    }
}

/**
 * DELETE /api/media
 * Delete one or more media files
 * Body: { ids: string[] }
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: body, error: parseError } = await parseJsonBody<{ ids?: string[] }>(request);
        if (parseError) return parseError;
        const { ids } = body;

        if (!Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ error: 'No media IDs provided' }, { status: 400 });
        }

        // Fetch media items to get file paths (with workspace isolation)
        const mediaItems = await db.media.findMany({
            where: {
                id: { in: ids },
                organizationId: session.user.currentOrganizationId,
            },
            select: {
                id: true,
                url: true,
                thumbnailUrl: true,
                transcodedUrl: true,
                transcodeStatus: true,
                _count: { select: { posts: true } },
            },
        });

        if (mediaItems.length === 0) {
            return NextResponse.json({ error: 'No matching media found' }, { status: 404 });
        }

        // Check if any media is used in non-published posts (draft/scheduled)
        const usedMedia = mediaItems.filter((m: { _count: { posts: number } }) => m._count.posts > 0);
        if (usedMedia.length > 0) {
            // Check for active (non-published) post associations
            const activePostAssociations = await db.postMedia.findMany({
                where: {
                    mediaId: { in: usedMedia.map((m: { id: string }) => m.id) },
                    post: { status: { in: ['DRAFT', 'SCHEDULED'] } },
                },
                select: { mediaId: true },
            });

            if (activePostAssociations.length > 0) {
                const blockedIds = [...new Set(activePostAssociations.map((a: { mediaId: string }) => a.mediaId))];
                return NextResponse.json(
                    {
                        error: `Cannot delete ${blockedIds.length} file(s) — they are used in draft or scheduled posts. Remove them from those posts first.`,
                        blockedIds,
                    },
                    { status: 409 }
                );
            }
        }

        // Cancel any in-flight transcode jobs and clean up Redis progress keys
        // Why: Without this, deleting a transcoding video leaves an orphaned BullMQ
        // job that tries to update a non-existent DB record when it completes.
        const transcodingItems = mediaItems.filter(
            (m: { transcodeStatus: string | null }) => m.transcodeStatus === 'pending' || m.transcodeStatus === 'processing'
        );
        if (transcodingItems.length > 0) {
            try {
                const redis = (await import('@/lib/bullmq/connection')).getRedisConnection();
                await Promise.allSettled(
                    transcodingItems.map(async (item: { id: string }) => {
                        // Remove the BullMQ job if it hasn't started yet
                        const job = await videoTranscodeQueue.getJob(`transcode-${item.id}`);
                        if (job) {
                            await job.remove().catch(() => {});
                        }
                        // Clean up Redis progress key
                        await redis.del(`transcode:progress:${item.id}`).catch(() => {});
                    }),
                );
            } catch {
                // Non-critical: job will fail gracefully when it can't find the DB record
            }
        }

        // Delete files from disk (including thumbnails and transcoded versions)
        // Why (BUG-06): Previously only the primary file was deleted, causing
        // thumbnail and transcoded files to accumulate indefinitely on disk.
        const deletePromises = mediaItems.map(async (item: { id: string; url: string; thumbnailUrl?: string | null; transcodedUrl?: string | null }) => {
            const deleteFile = async (url: string | null | undefined) => {
                if (!url) return;
                const relativePath = url.replace(/^\/api\/uploads\//, '');
                const filePath = path.join(UPLOAD_DIR, relativePath);
                try {
                    await unlink(filePath);
                } catch {
                    // File may already be deleted or not exist
                }
            };

            await deleteFile(item.url);
            await deleteFile(item.thumbnailUrl);
            await deleteFile(item.transcodedUrl);
        });
        await Promise.all(deletePromises);

        // Delete database records
        await db.media.deleteMany({
            where: {
                id: { in: mediaItems.map((m: { id: string }) => m.id) },
            },
        });

        return NextResponse.json({
            success: true,
            deleted: mediaItems.length,
        });
    } catch (error) {
        logger.error({ error }, 'Failed to delete media');
        return NextResponse.json({ error: 'Failed to delete media' }, { status: 500 });
    }
}
