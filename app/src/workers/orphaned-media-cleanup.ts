/**
 * Orphaned Media Cleanup Worker
 * Periodically cleans up media files that are no longer referenced by any post.
 *
 * Why: Users upload media, then discard drafts or delete posts. Over time,
 * this creates "orphaned" files consuming storage. This worker runs daily
 * to identify and remove unreferenced media older than 7 days.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

/** Minimum age for orphaned media before deletion (7 days) */
const ORPHAN_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Maximum files to process per run (prevents long-running jobs) */
const BATCH_SIZE = 100;

export interface CleanupResult {
    scanned: number;
    deleted: number;
    errors: number;
    freedBytes: number;
}

/**
 * Find and delete orphaned media files.
 *
 * @param dryRun - If true, only report what would be deleted
 * @returns Cleanup statistics
 */
export async function cleanupOrphanedMedia(dryRun: boolean = false): Promise<CleanupResult> {
    const result: CleanupResult = {
        scanned: 0,
        deleted: 0,
        errors: 0,
        freedBytes: 0,
    };

    const cutoffDate = new Date(Date.now() - ORPHAN_AGE_MS);

    try {
        // Find media that:
        // 1. Was created more than 7 days ago
        // 2. Has no PostMedia references (using 'posts' relation)
        // 3. Is not associated with any media folder
        const orphanedMedia = await db.media.findMany({
            where: {
                createdAt: { lt: cutoffDate },
                posts: { none: {} },
                // Why: Media explicitly saved to a folder should never be auto-deleted,
                // even if it's not attached to any post.
                folderId: null,
            },
            take: BATCH_SIZE,
            select: {
                id: true,
                url: true,
                thumbnailUrl: true,
                size: true,
            },
        });

        result.scanned = orphanedMedia.length;
        logger.info({ count: orphanedMedia.length, dryRun }, 'Found orphaned media files');

        for (const media of orphanedMedia) {
            try {
                // Check if this media is used as a custom thumbnail anywhere
                const usedAsThumbnail = await db.postMedia.findFirst({
                    where: { customThumbnailUrl: media.url },
                });

                if (usedAsThumbnail) {
                    logger.debug({ mediaId: media.id }, 'Media used as thumbnail, skipping');
                    continue;
                }

                if (!dryRun) {
                    // Delete physical files
                    await deletePhysicalFile(media.url);
                    if (media.thumbnailUrl) {
                        await deletePhysicalFile(media.thumbnailUrl);
                    }

                    // Delete database record
                    await db.media.delete({ where: { id: media.id } });
                }

                result.deleted++;
                result.freedBytes += media.size || 0;

                logger.info({ mediaId: media.id, size: media.size, dryRun }, 'Deleted orphaned media');
            } catch (error) {
                result.errors++;
                logger.error({ mediaId: media.id, error }, 'Failed to delete orphaned media');
            }
        }

        logger.info(result, 'Orphaned media cleanup completed');
        return result;
    } catch (error) {
        logger.error({ error }, 'Orphaned media cleanup failed');
        throw error;
    }
}

/**
 * Delete a physical file from the filesystem.
 * Handles both local paths and ignores external URLs.
 *
 * Why (BUG-07): Previously used a regex `url.replace(/^\/uploads\//, '')` to extract
 * the filename, but media URLs are stored as `/api/uploads/filename`, so the regex
 * never matched and files were never deleted. Now uses `path.basename()` for reliable
 * filename extraction, matching the media DELETE endpoint's approach.
 */
async function deletePhysicalFile(url: string): Promise<void> {
    // Skip external URLs
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return;
    }

    // Extract filename from URL and resolve against the uploads directory
    const filename = path.basename(url);
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    const fullPath = path.join(uploadsDir, filename);

    if (existsSync(fullPath)) {
        await unlink(fullPath);
        logger.debug({ path: fullPath }, 'Deleted physical file');
    }
}

/**
 * Get statistics about potentially orphaned media without deleting.
 */
export async function getOrphanedMediaStats(): Promise<{
    count: number;
    totalSizeBytes: number;
    oldestDate: Date | null;
}> {
    const cutoffDate = new Date(Date.now() - ORPHAN_AGE_MS);

    const stats = await db.media.aggregate({
        _count: { id: true },
        _sum: { size: true },
        _min: { createdAt: true },
        where: {
            createdAt: { lt: cutoffDate },
            posts: { none: {} },
        },
    });

    return {
        count: stats._count?.id || 0,
        totalSizeBytes: stats._sum?.size || 0,
        oldestDate: stats._min?.createdAt || null,
    };
}
