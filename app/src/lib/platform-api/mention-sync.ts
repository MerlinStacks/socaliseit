/**
 * Mentions Sync Engine
 * Orchestrates fetching and storing mentions and tags
 */

import { db } from '@/lib/db';
import { getInstagramMentions } from './instagram-api';
import { getFacebookMentions } from './facebook-api';
// TikTok/YouTube mentions also possible but lower priority for now (often notified via comments stream anyway)
import { ApiResponse, PlatformMention } from './types';
import { ensureValidToken } from '@/lib/services/token-service';
import { logger } from '@/lib/logger';

/**
 * Sync Mentions for an Account
 *
 * Why (BUG-39): Previously used `account.accessToken` directly, which is encrypted
 * in the DB. Now routes through `ensureValidToken` for decryption + refresh.
 *
 * Why (BUG-53): Previously used `Promise.all` for upserts with no concurrency
 * limit. Now processes sequentially to avoid DB connection pool exhaustion.
 */
export async function syncAccountMentions(socialAccountId: string) {
    const account = await db.socialAccount.findUnique({
        where: { id: socialAccountId }
    });

    if (!account) return { success: false, error: 'Account not found' };

    // Why (BUG-39): Decrypt and refresh the token before API calls
    const tokenResult = await ensureValidToken(account.id);
    if (!tokenResult.success || !tokenResult.accessToken) {
        return { success: false, error: tokenResult.error || 'Token refresh failed' };
    }
    const accessToken = tokenResult.accessToken;

    let result: ApiResponse<PlatformMention[]> = { success: false, error: 'Unsupported platform' };

    try {
        switch (account.platform) {
            case 'INSTAGRAM':
                result = await getInstagramMentions(accessToken, account.platformId);
                break;
            case 'FACEBOOK':
                result = await getFacebookMentions(accessToken, account.platformId);
                break;
            // TikTok/YouTube/Pinterest mentions logic would go here
        }

        if (result.success && result.data) {
            // Why (BUG-53): Process sequentially to avoid DB pool exhaustion
            for (const m of result.data) {
                await db.mention.upsert({
                    where: {
                        socialAccountId_platformPostId_type: {
                            socialAccountId: account.id,
                            platformPostId: m.platformPostId,
                            type: m.type
                        }
                    },
                    update: {
                        authorUsername: m.authorUsername,
                        authorAvatar: m.authorAvatar,
                        text: m.text,
                        mediaUrl: m.mediaUrl,
                        syncedAt: new Date()
                    },
                    create: {
                        organizationId: account.organizationId,
                        socialAccountId: account.id,
                        type: m.type, // 'mention' or 'tag'
                        platformPostId: m.platformPostId,
                        authorId: m.authorId,
                        authorUsername: m.authorUsername,
                        authorAvatar: m.authorAvatar,
                        text: m.text,
                        mediaUrl: m.mediaUrl,
                        createdAt: m.createdAt,
                    }
                });
            }
            return { success: true, count: result.data.length };
        } else {
            return { success: false, error: result.error };
        }
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        logger.error({ err: e, socialAccountId }, 'Mention sync failed');
        return { success: false, error: message };
    }
}
