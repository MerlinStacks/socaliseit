/**
 * Media API Routes
 * Upload, list, and delete media files with workspace isolation
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { generateVideoThumbnail } from '@/lib/media/thumbnail-generator';
import { parseJsonBody } from '@/lib/parse-json-body';
import { checkRateLimit, createRateLimitHeaders, type RateLimitConfig } from '@/lib/rate-limit';
import { sanitizeError } from '@/lib/sanitize-error';

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
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');

        // Build where clause with workspace isolation
        const where: Record<string, unknown> = {
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

        // Usage filter: filter by whether media has been used in posts
        if (usage === 'used') {
            where.posts = { some: {} };
        } else if (usage === 'unused') {
            where.posts = { none: {} };
        }

        // Search filter
        if (search) {
            where.OR = [
                { filename: { contains: search, mode: 'insensitive' } },
                { tags: { has: search.toLowerCase() } },
            ];
        }

        const [media, total] = await Promise.all([
            db.media.findMany({
                where,
                include: {
                    folder: { select: { id: true, name: true, color: true } },
                    _count: { select: { posts: true } }
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset,
            }),
            db.media.count({ where }),
        ]);

        return NextResponse.json({
            media: media.map((m: { id: string; filename: string; url: string; thumbnailUrl: string | null; mimeType: string; size: number; width: number | null; height: number | null; duration: number | null; tags: string[]; createdAt: Date; folder: { id: string; name: string; color: string } | null; _count: { posts: number } }) => ({
                id: m.id,
                filename: m.filename,
                url: m.url,
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
            })),
            total,
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

        logger.debug({ filePath, size: file.size }, 'File written to disk using streaming');

        // Parse tags
        const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) : [];

        // Generate thumbnail URL
        // Why: Videos need a separate thumbnail image; images can use themselves
        let thumbnailUrl: string | null = null;
        if (mimeType.startsWith('image/')) {
            thumbnailUrl = `/api/uploads/${uniqueName}`;
        } else if (mimeType.startsWith('video/')) {
            // Extract frame from video using FFmpeg
            const baseName = uniqueName.replace(ext, '');
            thumbnailUrl = await generateVideoThumbnail(filePath, baseName);
        }

        // Create database record
        const mediaItem = await db.media.create({
            data: {
                organizationId: session.user.currentOrganizationId,
                folderId: folderId || null,
                filename: file.name,
                mimeType: mimeType,
                size: file.size,
                url: `/api/uploads/${uniqueName}`,
                thumbnailUrl,
                tags,
            },
            include: { folder: { select: { id: true, name: true, color: true } } },
        });

        return NextResponse.json({
            id: mediaItem.id,
            filename: mediaItem.filename,
            url: mediaItem.url,
            thumbnailUrl: mediaItem.thumbnailUrl,
            type: mediaItem.mimeType.startsWith('video/') ? 'video' : mediaItem.mimeType.startsWith('audio/') ? 'audio' : 'image',
            mimeType: mediaItem.mimeType,
            size: mediaItem.size,
            tags: mediaItem.tags,
            folder: mediaItem.folder,
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
            include: {
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

        // Delete files from disk
        const deletePromises = mediaItems.map(async (item: { id: string; url: string }) => {
            const filename = path.basename(item.url);
            const filePath = path.join(UPLOAD_DIR, filename);
            try {
                await unlink(filePath);
            } catch {
                // File may already be deleted or not exist
                logger.warn(`Could not delete file: ${filePath}`);
            }
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
