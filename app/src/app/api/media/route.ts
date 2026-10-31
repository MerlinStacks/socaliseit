/**
 * Media API Routes
 * Upload, list, and delete media files with workspace isolation
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { Prisma } from '@/generated/prisma/client';
import { unlink } from 'fs/promises';
import path from 'path';
import { videoTranscodeQueue } from '@/lib/bullmq/queues';
import { parseJsonBody } from '@/lib/parse-json-body';
import { checkRateLimit, createRateLimitHeaders, type RateLimitConfig } from '@/lib/rate-limit';
import { computeImageHash } from '@/lib/media/image-hash';
import { uploadMedia } from '@/lib/media/upload-service';

/** Media upload rate limit: 20 uploads per minute (higher than expensive ops) */
const MEDIA_UPLOAD_RATE_LIMIT: RateLimitConfig = {
    max: 20,
    windowSeconds: 60,
    prefix: 'ratelimit:media-upload',
};

/** Stream large videos to disk; allow time for slower upstream connections. */
export const dynamic = 'force-dynamic';
export const maxDuration = 1800;
export const fetchCache = 'force-no-store';

export const runtime = 'nodejs'; // Ensure we're using Node.js runtime for fs operations

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

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
            media: media.map((m) => ({
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
                aiTagStatus: m.aiTagStatus,
                aiTagError: m.aiTagError,
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

        return uploadMedia(request, session.user.currentOrganizationId);
    } catch (error) {
        logger.error({ error }, 'Failed to upload media');
        return NextResponse.json({ error: 'Failed to upload media' }, { status: 500 });
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

        // Only published posts can relinquish their local media attachments.
        const usedMedia = mediaItems.filter((m: { _count: { posts: number } }) => m._count.posts > 0);
        if (usedMedia.length > 0) {
            // Check for active (non-published) post associations
            const activePostAssociations = await db.postMedia.findMany({
                where: {
                    mediaId: { in: usedMedia.map((m: { id: string }) => m.id) },
                    post: { status: { not: 'PUBLISHED' } },
                },
                select: { mediaId: true },
            });

            if (activePostAssociations.length > 0) {
                const blockedIds = [...new Set(activePostAssociations.map((a: { mediaId: string }) => a.mediaId))];
                return NextResponse.json(
                    {
                        error: `Cannot delete ${blockedIds.length} file(s) — they are used in unpublished posts (draft, scheduled, publishing, or failed). Remove them from those posts first.`,
                        blockedIds,
                    },
                    { status: 409 }
                );
            }
        }

        // Commit the database deletion before touching files or jobs. Removing only
        // published links keeps the FK guard effective if an active link is added
        // after the check above; a failure rolls back the detached links as well.
        const mediaIds = mediaItems.map((m) => m.id);
        const deleted = await db.$transaction(async (tx) => {
            await tx.postMedia.deleteMany({
                where: {
                    mediaId: { in: mediaIds },
                    media: { organizationId: session.user.currentOrganizationId },
                    post: {
                        organizationId: session.user.currentOrganizationId,
                        status: 'PUBLISHED',
                    },
                },
            });
            return tx.media.deleteMany({
                where: {
                    id: { in: mediaIds },
                    organizationId: session.user.currentOrganizationId,
                },
            });
        });

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

        return NextResponse.json({
            success: true,
            deleted: deleted.count,
        });
    } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2003') {
            return NextResponse.json(
                { error: 'Cannot delete media that is still attached to posts. Refresh and remove it from those posts first.' },
                { status: 409 },
            );
        }
        logger.error({ error }, 'Failed to delete media');
        return NextResponse.json({ error: 'Failed to delete media' }, { status: 500 });
    }
}
