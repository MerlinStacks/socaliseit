/**
 * Mentions Sync Engine
 * Orchestrates fetching and storing mentions and tags
 */

import { db } from '@/lib/db';
import { getInstagramMentions } from './instagram-api';
import { getFacebookMentions } from './facebook-api';
// TikTok/YouTube mentions also possible but lower priority for now (often notified via comments stream anyway)
import { ApiResponse, PlatformMention } from './types';

/**
 * Sync Mentions for an Account
 */
export async function syncAccountMentions(socialAccountId: string) {
    const account = await db.socialAccount.findUnique({
        where: { id: socialAccountId }
    });

    if (!account) return { success: false, error: 'Account not found' };

    let result: ApiResponse<PlatformMention[]> = { success: false, error: 'Unsupported platform' };

    try {
        switch (account.platform) {
            case 'INSTAGRAM':
                result = await getInstagramMentions(account.accessToken, account.platformId);
                break;
            case 'FACEBOOK':
                result = await getFacebookMentions(account.accessToken, account.platformId);
                break;
            // TikTok/YouTube/Pinterest mentions logic would go here
        }

        if (result.success && result.data) {
            await Promise.all(result.data.map(async (m) => {
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
                        workspaceId: account.workspaceId,
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
            }));
            return { success: true, count: result.data.length };
        } else {
            return { success: false, error: result.error };
        }
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
