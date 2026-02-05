/**
 * Media Cleanup Service
 * 
 * Handles orphaned media records and files.
 * Orphans can occur from:
 * - Failed uploads (file exists, DB record missing)
 * - Deleted posts without proper cascade (DB record exists, file deleted)
 * - Interrupted operations
 * 
 * Why: Orphaned media wastes storage and can cause broken image references.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface CleanupResult {
    /** DB records found without corresponding files */
    dbOrphans: number;
    /** Files found without DB records */
    fileOrphans: number;
    /** Records/files removed (if dryRun=false) */
    cleaned: number;
    /** Errors encountered during cleanup */
    errors: string[];
}

/**
 * Find orphaned media records (DB entries without files)
 * 
 * Note: In production, files are typically stored in S3/R2, so this
 * checks if the URL is still accessible rather than filesystem.
 * 
 * @param organizationId - Scope cleanup to specific org
 * @returns Array of orphaned media IDs
 */
export async function findDbOrphans(organizationId?: string): Promise<string[]> {
    const orphanIds: string[] = [];

    try {
        const mediaRecords = await db.media.findMany({
            where: organizationId ? { organizationId } : {},
            select: { id: true, url: true },
            take: 500, // Process in batches
        });

        for (const record of mediaRecords) {
            // Skip external URLs (these are from synced posts, not our storage)
            if (record.url.includes('instagram.com') ||
                record.url.includes('facebook.com') ||
                record.url.includes('twitter.com') ||
                record.url.includes('tiktok.com')) {
                continue;
            }

            // For internal uploads, check if URL is accessible
            try {
                const response = await fetch(record.url, { method: 'HEAD' });
                if (response.status === 404) {
                    orphanIds.push(record.id);
                }
            } catch {
                // Network error - could be temporary, don't mark as orphan
                logger.warn({ mediaId: record.id }, 'Could not verify media URL');
            }
        }
    } catch (error) {
        logger.error({ error }, 'Error finding DB orphans');
    }

    return orphanIds;
}

/**
 * Find stale draft posts linked to disconnected social accounts
 * 
 * @param organizationId - Organization to check
 * @returns Array of stale draft info
 */
export async function findStaleDrafts(organizationId: string): Promise<Array<{
    postId: string;
    caption: string;
    accountName: string;
    disconnectedAt: Date | null;
}>> {
    const staleDrafts: Array<{
        postId: string;
        caption: string;
        accountName: string;
        disconnectedAt: Date | null;
    }> = [];

    try {
        // Find drafts linked to inactive/disconnected accounts
        const drafts = await db.post.findMany({
            where: {
                organizationId,
                status: 'DRAFT',
                isAiGenerated: false, // Only user-created drafts
                socialAccount: {
                    isActive: false, // Account was disconnected
                },
            },
            select: {
                id: true,
                caption: true,
                socialAccount: {
                    select: {
                        name: true,
                        updatedAt: true,
                    },
                },
            },
        });

        for (const draft of drafts) {
            if (draft.socialAccount) {
                staleDrafts.push({
                    postId: draft.id,
                    caption: draft.caption.slice(0, 100),
                    accountName: draft.socialAccount.name,
                    disconnectedAt: draft.socialAccount.updatedAt,
                });
            }
        }
    } catch (error) {
        logger.error({ error, organizationId }, 'Error finding stale drafts');
    }

    return staleDrafts;
}

/**
 * Clean up orphaned media records
 * 
 * @param mediaIds - IDs of media records to delete
 * @param dryRun - If true, only report what would be deleted
 * @returns Cleanup result
 */
export async function cleanupOrphanedMedia(
    mediaIds: string[],
    dryRun: boolean = true
): Promise<CleanupResult> {
    const result: CleanupResult = {
        dbOrphans: mediaIds.length,
        fileOrphans: 0,
        cleaned: 0,
        errors: [],
    };

    if (dryRun) {
        logger.info({ count: mediaIds.length }, 'Dry run: would delete orphaned media records');
        return result;
    }

    try {
        // Delete in batches to avoid timeout
        const batchSize = 50;
        for (let i = 0; i < mediaIds.length; i += batchSize) {
            const batch = mediaIds.slice(i, i + batchSize);

            await db.media.deleteMany({
                where: { id: { in: batch } },
            });

            result.cleaned += batch.length;
        }

        logger.info({ cleaned: result.cleaned }, 'Cleaned up orphaned media records');
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(message);
        logger.error({ error }, 'Error cleaning up orphaned media');
    }

    return result;
}

/**
 * Get media cleanup summary for an organization
 * 
 * @param organizationId - Organization to analyze
 * @returns Summary of media health
 */
export async function getMediaHealthSummary(organizationId: string): Promise<{
    totalMedia: number;
    potentialOrphans: number;
    staleDrafts: number;
}> {
    const [totalMedia, orphans, staleDrafts] = await Promise.all([
        db.media.count({ where: { organizationId } }),
        findDbOrphans(organizationId),
        findStaleDrafts(organizationId),
    ]);

    return {
        totalMedia,
        potentialOrphans: orphans.length,
        staleDrafts: staleDrafts.length,
    };
}
