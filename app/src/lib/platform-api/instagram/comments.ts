/**
 * Instagram Comments Functions
 * Why: Fetching and replying to comments on Instagram media.
 */

import { ApiResponse, PlatformComment } from '../types';
import { GRAPH_API_URL } from './constants';
import { logger } from '@/lib/logger';

/**
 * Fetch Comments for a Media Object
 */
export async function getInstagramComments(
    accessToken: string,
    mediaId: string
): Promise<ApiResponse<PlatformComment[]>> {
    try {
        const url = `${GRAPH_API_URL}/${mediaId}/comments?fields=id,text,username,timestamp,like_count,from{id,username,profile_picture_url},replies{id,text,username,timestamp,like_count,from{id,username,profile_picture_url}}&access_token=${accessToken}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            return { success: false, error: data.error.message };
        }

        const comments: PlatformComment[] = [];

        const processComment = (c: Record<string, unknown>, parentId?: string) => {
            comments.push({
                platformCommentId: String(c.id),
                platformPostId: mediaId,
                authorId: String((c.from as Record<string, unknown>)?.id || c.username),
                authorUsername: String((c.from as Record<string, unknown>)?.username || c.username),
                authorAvatar: String((c.from as Record<string, unknown>)?.profile_picture_url || ''),
                text: String(c.text || ''),
                likeCount: Number(c.like_count) || 0,
                replyCount: Number(((c.replies as Record<string, unknown>)?.data as Array<unknown>)?.length) || 0,
                createdAt: new Date(String(c.timestamp)),
                parentId: parentId,
            });

            // Process replies recursively
            const replies = (c.replies as Record<string, unknown>)?.data as Array<Record<string, unknown>>;
            if (replies) {
                replies.forEach((r: Record<string, unknown>) => processComment(r, String(c.id)));
            }
        };

        const commentItems = data.data as Array<Record<string, unknown>>;
        commentItems?.forEach((c: Record<string, unknown>) => processComment(c));

        return {
            success: true,
            data: comments
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to fetch Instagram comments';
        return { success: false, error: message };
    }
}

/**
 * Reply to a Comment
 */
export async function replyToInstagramComment(
    accessToken: string,
    commentId: string,
    text: string
): Promise<ApiResponse<{ id: string }>> {
    try {
        const url = `${GRAPH_API_URL}/${commentId}/replies`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: text })
        });
        const data = await response.json();

        if (!response.ok || data.error) {
            const msg = data.error?.message || `HTTP ${response.status}`;
            const code = data.error?.code;
            logger.warn({ commentId, status: response.status, errorCode: code, error: msg }, 'Instagram comment reply failed');
            // Code 10/200 = permission error — instagram_manage_comments is likely missing
            const hint = code === 200 || code === 10 || code === 3
                ? ' (App may be missing instagram_manage_comments permission)'
                : '';
            return { success: false, error: `Instagram: ${msg}${hint}` };
        }

        return {
            success: true,
            data: { id: data.id }
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to reply to Instagram comment';
        return { success: false, error: message };
    }
}
