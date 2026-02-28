/**
 * Relink Orphaned Posts Service
 *
 * Why: When a SocialAccount is deleted, Post.socialAccountId is set to NULL
 * (onDelete: SetNull). If the same account is re-added later, a new row is
 * created with a different id — leaving orphaned posts disconnected. This
 * function repairs that by matching orphaned posts back to the new account.
 */

import { db } from '@/lib/db';
import { createRouteLogger } from '@/lib/logger';
import type { Platform } from '@/generated/prisma/enums';

const logger = createRouteLogger('Service', 'relink-orphaned-posts');

/**
 * Re-associate posts that lost their socialAccountId after an account deletion.
 * Matches on (organizationId, platform) where socialAccountId IS NULL.
 *
 * @param organizationId - Organization owning the posts
 * @param socialAccountId - The newly created SocialAccount id to link to
 * @param platform - Platform enum value (e.g. INSTAGRAM, TIKTOK)
 * @returns Number of posts relinked
 */
export async function relinkOrphanedPosts(
    organizationId: string,
    socialAccountId: string,
    platform: Platform,
): Promise<number> {
    try {
        const result = await db.post.updateMany({
            where: {
                organizationId,
                platform,
                socialAccountId: null,
            },
            data: {
                socialAccountId,
            },
        });

        if (result.count > 0) {
            logger.info(
                { organizationId, socialAccountId, platform, relinked: result.count },
                'Relinked orphaned posts to re-added account',
            );
        }

        return result.count;
    } catch (error) {
        // Why: Relinking is best-effort — a failure here should not block account creation
        logger.error(
            { error, organizationId, socialAccountId, platform },
            'Failed to relink orphaned posts',
        );
        return 0;
    }
}
