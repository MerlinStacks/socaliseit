/**
 * Mention Sync Service
 * Syncs mentions and tags from connected platform APIs to database
 */

import { db } from '@/lib/db';
import { getInstagramMentions } from '@/lib/platform-api/instagram-api';
import { logger } from '@/lib/logger';
import type { Prisma } from '@/generated/prisma/client';

export interface SyncMentionsResult {
    success: boolean;
    synced: number;
    errors: string[];
}

/**
 * Sync mentions and tags for a specific workspace
 * 
 * Why: Fetches new mentions/tags from Instagram and stores them in database
 * for display on the Listening page.
 */
export async function syncMentionsForWorkspace(
    workspaceId: string
): Promise<SyncMentionsResult> {
    const result: SyncMentionsResult = {
        success: true,
        synced: 0,
        errors: [],
    };

    try {
        // Get all active Instagram accounts for the workspace
        const instagramAccounts = await db.socialAccount.findMany({
            where: {
                workspaceId,
                platform: 'INSTAGRAM',
                isActive: true,
            },
        });

        if (instagramAccounts.length === 0) {
            logger.debug({ workspaceId }, 'No Instagram accounts for mention sync');
            return result;
        }

        for (const account of instagramAccounts) {
            try {
                logger.info({ accountId: account.id }, 'Syncing mentions for Instagram account');

                const mentionsResult = await getInstagramMentions(
                    account.accessToken,
                    account.platformId
                );

                if (!mentionsResult.success || !mentionsResult.data) {
                    result.errors.push(`Failed to fetch mentions for ${account.username || account.platformId}: ${mentionsResult.error}`);
                    continue;
                }

                // Upsert each mention into the database
                for (const mention of mentionsResult.data) {
                    try {
                        // Use compound unique key: socialAccountId + platformPostId + type
                        const mentionType = mention.type.toLowerCase();

                        await db.mention.upsert({
                            where: {
                                socialAccountId_platformPostId_type: {
                                    socialAccountId: account.id,
                                    platformPostId: mention.platformPostId,
                                    type: mentionType,
                                },
                            },
                            update: {
                                text: mention.text,
                                mediaUrl: mention.mediaUrl,
                            },
                            create: {
                                workspaceId,
                                socialAccountId: account.id,
                                platformPostId: mention.platformPostId,
                                type: mentionType,
                                authorUsername: mention.authorUsername,
                                authorId: mention.authorId,
                                text: mention.text,
                                mediaUrl: mention.mediaUrl,
                                createdAt: mention.createdAt,
                                isRead: false,
                            },
                        });
                        result.synced++;
                    } catch (upsertError) {
                        logger.warn({ mention, error: upsertError }, 'Failed to upsert mention');
                    }
                }

                // Synced successfully for this account

            } catch (accountError) {
                const errorMessage = accountError instanceof Error ? accountError.message : 'Unknown error';
                result.errors.push(`Error syncing ${account.username || account.platformId}: ${errorMessage}`);
                logger.error({ accountId: account.id, error: accountError }, 'Error syncing mentions for account');
            }
        }

        result.success = result.errors.length === 0;
        return result;

    } catch (error) {
        logger.error({ workspaceId, error }, 'Error in syncMentionsForWorkspace');
        result.success = false;
        result.errors.push(error instanceof Error ? error.message : 'Unknown error');
        return result;
    }
}

export interface MentionFilters {
    type?: string;
    isRead?: boolean;
    startDate?: Date;
    endDate?: Date;
}

/**
 * Get mentions for a workspace with filtering
 */
export async function getMentionsForWorkspace(
    workspaceId: string,
    filters: MentionFilters = {},
    limit: number = 50,
    offset: number = 0
) {
    const where: Prisma.MentionWhereInput = {
        workspaceId,
    };

    if (filters.type) {
        where.type = filters.type;
    }

    if (filters.isRead !== undefined) {
        where.isRead = filters.isRead;
    }

    if (filters.startDate || filters.endDate) {
        where.createdAt = {};
        if (filters.startDate) {
            where.createdAt.gte = filters.startDate;
        }
        if (filters.endDate) {
            where.createdAt.lte = filters.endDate;
        }
    }

    const [mentions, total] = await Promise.all([
        db.mention.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
            include: {
                socialAccount: {
                    select: {
                        username: true,
                        platform: true,
                    },
                },
            },
        }),
        db.mention.count({ where }),
    ]);

    return { mentions, total };
}

/**
 * Mark mentions as read
 */
export async function markMentionsAsRead(
    workspaceId: string,
    mentionIds: string[]
): Promise<number> {
    const result = await db.mention.updateMany({
        where: {
            workspaceId,
            id: { in: mentionIds },
        },
        data: {
            isRead: true,
        },
    });

    return result.count;
}
