/**
 * Instagram Comments Functions
 * Why: Fetching and replying to comments on Instagram media.
 */

import { ApiResponse, PlatformComment } from '../types';
import { GRAPH_API_URL } from './constants';

/**
 * Fetch Comments for a Media Object
 */
export async function getInstagramComments(
    accessToken: string,
    mediaId: string
): Promise<ApiResponse<PlatformComment[]>> {
    try {
        const url = `${GRAPH_API_URL}/${mediaId}/comments?fields=id,text,username,timestamp,like_count,replies{id,text,username,timestamp,like_count}&access_token=${accessToken}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            return { success: false, error: data.error.message };
        }

        const comments: PlatformComment[] = [];

        const processComment = (c: any, parentId?: string) => {
            comments.push({
                platformCommentId: c.id,
                platformPostId: mediaId,
                authorId: c.username,
                authorUsername: c.username,
                text: c.text,
                likeCount: c.like_count || 0,
                replyCount: c.replies?.data?.length || 0,
                createdAt: new Date(c.timestamp),
                parentId: parentId,
            });

            // Process replies recursively
            if (c.replies?.data) {
                c.replies.data.forEach((r: any) => processComment(r, c.id));
            }
        };

        data.data.forEach((c: any) => processComment(c));

        return {
            success: true,
            data: comments
        };
    } catch (error: any) {
        return { success: false, error: error.message };
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
        const url = `${GRAPH_API_URL}/${commentId}/replies?access_token=${accessToken}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        const data = await response.json();

        if (data.error) {
            return { success: false, error: data.error.message };
        }

        return {
            success: true,
            data: { id: data.id }
        };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
