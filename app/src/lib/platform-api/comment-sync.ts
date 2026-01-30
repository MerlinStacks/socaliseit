/**
 * Comment Sync Engine
 * Orchestrates fetching and storing comments from all platforms
 */

import { db } from '@/lib/db';
import { getInstagramComments, replyToInstagramComment } from './instagram-api';
import { getFacebookComments, replyToFacebookComment, toggleHideFacebookComment } from './facebook-api';
import { getTikTokComments, replyToTikTokComment } from './tiktok-api';
import { getYouTubeComments, replyToYouTubeComment } from './youtube-api';
import { ApiResponse, PlatformComment } from './types';

/**
 * Sync Comments for a Specific Post
 */
export async function syncPostComments(postPlatformId: string) {
    const post = await db.postPlatform.findFirst({
        where: { id: postPlatformId },
        include: { socialAccount: true }
    });

    if (!post || !post.platformPostId) return { success: false, error: 'Post not found or not published' };

    return await syncCommentsForPlatformPost(post.socialAccount, post.platformPostId, post.id);
}

/**
 * Sync Comments for a Platform Activity (e.g. manual fetch by platform ID)
 */
export async function syncCommentsForPlatformPost(
    account: any,
    platformPostId: string,
    internalPostId?: string
) {
    let result: ApiResponse<PlatformComment[]> = { success: false, error: 'Unsupported platform' };

    try {
        switch (account.platform) {
            case 'INSTAGRAM':
                result = await getInstagramComments(account.accessToken, platformPostId);
                break;
            case 'FACEBOOK':
                result = await getFacebookComments(account.accessToken, platformPostId);
                break;
            case 'TIKTOK':
                result = await getTikTokComments(account.accessToken, platformPostId);
                break;
            case 'YOUTUBE':
                result = await getYouTubeComments(account.accessToken, platformPostId);
                break;
        }

        if (result.success && result.data) {
            // Upsert comments
            await Promise.all(result.data.map(async (c) => {
                // Determine sentiment (mocked or handled by other service later)
                // If threading exists, we need to ensure parent exists first.
                // However, API usually returns flat or nested. 
                // We'll upsert independently but might need two passes if parentId refers to a comment we haven't processed yet.
                // Best effort: Upsert parent first if found in same batch.

                // For now, simple upsert.

                // Check if we already have it to preserve 'isRead' or 'sentiment' manual overrides if we allowed them
                const existing = await db.comment.findUnique({
                    where: { socialAccountId_platformCommentId: { socialAccountId: account.id, platformCommentId: c.platformCommentId } }
                });

                await db.comment.upsert({
                    where: {
                        socialAccountId_platformCommentId: {
                            socialAccountId: account.id,
                            platformCommentId: c.platformCommentId
                        }
                    },
                    update: {
                        text: c.text,
                        likeCount: c.likeCount || 0,
                        replyCount: c.replyCount || 0,
                        isHidden: c.isHidden || false,
                        syncedAt: new Date()
                    },
                    create: {
                        workspaceId: account.workspaceId,
                        socialAccountId: account.id,
                        postPlatformId: internalPostId,
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
                        // If parent provided, we might need to resolve our internal ID for it.
                        // But we store parent's platform ID -> need to map to internal ID?
                        // Schema `parentId` points to internal ID.
                        // So we need to look up parent.
                    }
                });
            }));

            // Second pass for parenting (if needed)
            // Implementation detail: If comments come in flat list, we need to link them.
            // If they come nested, we process parent then child.
            // Simplified: We skip parent linking in this first pass implementation/mvp 
            // or do a quick lookup if parentId is in payload (which my types have).

            if (result.data.length > 0) {
                for (const c of result.data) {
                    if (c.parentId) {
                        const parent = await db.comment.findUnique({
                            where: { socialAccountId_platformCommentId: { socialAccountId: account.id, platformCommentId: c.parentId } }
                        });
                        const child = await db.comment.findUnique({
                            where: { socialAccountId_platformCommentId: { socialAccountId: account.id, platformCommentId: c.platformCommentId } }
                        });

                        if (parent && child) {
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

    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
