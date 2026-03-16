/**
 * Comment Sync Engine
 * Orchestrates fetching and storing comments from all platforms
 *
 * Why (BUG-40): Previously used raw `account.accessToken` (encrypted) for all
 * platform API calls. Now accepts a pre-decrypted token parameter.
 *
 * Why (BUG-52): Previously used `Promise.all` for DB upserts with no concurrency
 * limit, risking connection pool exhaustion. Now processes sequentially.
 *
 * Why (BUG-54): Previously typed `account` as `any`. Now uses a proper interface.
 *
 * Why (BUG-62): Parent comment linking previously looked up parent by platform
 * comment ID and correctly mapped it to internal ID. Preserved but made safer.
 */

import { db } from '@/lib/db';
import { getInstagramComments } from './instagram-api';
import { getFacebookComments } from './facebook-api';
import { getTikTokComments } from './tiktok-api';
import { getYouTubeComments } from './youtube-api';
import { ApiResponse, PlatformComment } from './types';
import { ensureValidToken } from '@/lib/services/token-service';
import { logger } from '@/lib/logger';
import type { Platform } from '@/generated/prisma/client';

/** Why (BUG-54): Proper type instead of `any` */
interface SyncAccount {
    id: string;
    organizationId: string;
    platform: Platform;
    accessToken: string;
}

/**
 * Sync Comments for a Specific Post
 *
 * Why (BUG-40): Decrypts token via `ensureValidToken` before passing
 * to the platform-specific comment fetcher.
 */
export async function syncPostComments(postId: string) {
    const post = await db.post.findFirst({
        where: { id: postId },
        include: { socialAccount: true }
    });

    if (!post || !post.platformPostId || !post.socialAccount) return { success: false, error: 'Post not found or not published' };

    // Why (BUG-40): Decrypt/refresh token before API calls
    const tokenResult = await ensureValidToken(post.socialAccount.id);
    if (!tokenResult.success || !tokenResult.accessToken) {
        return { success: false, error: tokenResult.error || 'Token refresh failed' };
    }

    return await syncCommentsForPlatformPost(
        post.socialAccount,
        post.platformPostId,
        post.id,
        tokenResult.accessToken
    );
}

/**
 * Sync Comments for a Platform Activity (e.g. manual fetch by platform ID)
 *
 * @param account - Social account (typed, not `any`)
 * @param platformPostId - The platform-specific post ID
 * @param internalPostId - Optional internal post ID for linking
 * @param accessToken - Pre-decrypted access token (from ensureValidToken)
 */
export async function syncCommentsForPlatformPost(
    account: SyncAccount,
    platformPostId: string,
    internalPostId?: string,
    accessToken?: string,
) {
    // Why (BUG-40): Use provided decrypted token, or decrypt now if not provided
    let token = accessToken;
    if (!token) {
        const tokenResult = await ensureValidToken(account.id);
        if (!tokenResult.success || !tokenResult.accessToken) {
            return { success: false, error: tokenResult.error || 'Token refresh failed' };
        }
        token = tokenResult.accessToken;
    }

    let result: ApiResponse<PlatformComment[]> = { success: false, error: 'Unsupported platform' };

    try {
        switch (account.platform) {
            case 'INSTAGRAM':
                result = await getInstagramComments(token, platformPostId);
                break;
            case 'FACEBOOK':
                result = await getFacebookComments(token, platformPostId);
                break;
            case 'TIKTOK':
                result = await getTikTokComments(token, platformPostId);
                break;
            case 'YOUTUBE':
                result = await getYouTubeComments(token, platformPostId);
                break;
        }

        if (result.success && result.data) {
            // Why (BUG-52): Process sequentially to avoid DB pool exhaustion
            for (const c of result.data) {
                await db.comment.upsert({
                    where: {
                        socialAccountId_platformCommentId: {
                            socialAccountId: account.id,
                            platformCommentId: c.platformCommentId
                        }
                    },
                    update: {
                        text: c.text,
                        authorAvatar: c.authorAvatar,
                        likeCount: c.likeCount || 0,
                        replyCount: c.replyCount || 0,
                        isHidden: c.isHidden || false,
                        syncedAt: new Date()
                    },
                    create: {
                        organizationId: account.organizationId,
                        socialAccountId: account.id,
                        postId: internalPostId,
                        platformPostId: platformPostId,
                        platformCommentId: c.platformCommentId,
                        authorId: c.authorId,
                        authorUsername: c.authorUsername,
                        authorAvatar: c.authorAvatar,
                        text: c.text,
                        likeCount: c.likeCount || 0,
                        replyCount: c.replyCount || 0,
                        createdAt: c.createdAt,
                        isHidden: c.isHidden || false,
                    }
                });
            }

            // Why (BUG-62): Second pass for parent-child linking.
            // parentId in the API response is the *platform* comment ID.
            // We look up the corresponding internal record to get its DB ID.
            for (const c of result.data) {
                if (c.parentId) {
                    const parent = await db.comment.findUnique({
                        where: { socialAccountId_platformCommentId: { socialAccountId: account.id, platformCommentId: c.parentId } }
                    });
                    if (parent) {
                        const child = await db.comment.findUnique({
                            where: { socialAccountId_platformCommentId: { socialAccountId: account.id, platformCommentId: c.platformCommentId } }
                        });
                        if (child && child.parentId !== parent.id) {
                            await db.comment.update({
                                where: { id: child.id },
                                data: { parentId: parent.id }
                            });
                        }
                    }
                }
            }

            return { success: true, count: result.data.length };
        } else {
            return { success: false, error: result.error };
        }

    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        logger.error({ err: e, platformPostId }, 'Comment sync failed');
        return { success: false, error: message };
    }
}
