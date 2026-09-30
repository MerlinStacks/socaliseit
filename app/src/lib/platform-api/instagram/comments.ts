/**
 * Instagram Comments Functions
 * Why: Fetching and replying to comments on Instagram media.
 */

import { ApiResponse, PlatformComment } from '../types';
import { GRAPH_API_URL } from './constants';
import { logger } from '@/lib/logger';
import { metaJson } from '../meta-fetch';

interface CommentPage {
    data?: Array<Record<string, unknown>>;
    paging?: { next?: string };
    error?: { message: string };
}

/**
 * Fetch Comments for a Media Object
 */
export async function getInstagramComments(
    accessToken: string,
    mediaId: string
): Promise<ApiResponse<PlatformComment[]>> {
    try {
        const url = `${GRAPH_API_URL}/${mediaId}/comments?fields=id,text,username,timestamp,like_count,from{id,username,profile_picture_url},replies{id,text,username,timestamp,like_count,from{id,username,profile_picture_url}}`;

        const comments: PlatformComment[] = [];

        const processComment = async (c: Record<string, unknown>, parentId?: string) => {
            const replies = c.replies as CommentPage | undefined;
            comments.push({
                platformCommentId: String(c.id),
                platformPostId: mediaId,
                authorId: String((c.from as Record<string, unknown>)?.id || c.username),
                authorUsername: String((c.from as Record<string, unknown>)?.username || c.username),
                authorAvatar: String((c.from as Record<string, unknown>)?.profile_picture_url || ''),
                text: String(c.text || ''),
                likeCount: Number(c.like_count) || 0,
                replyCount: replies?.data?.length || 0,
                createdAt: new Date(String(c.timestamp)),
                parentId: parentId,
            });

            // Why: Expanded replies are paginated independently of top-level comments.
            // Dropping their next page leaves native replies as standalone inbox threads.
            if (replies) {
                await processPage(replies, String(c.id));
            }
        };

        const processPage = async (initialPage: CommentPage, parentId?: string) => {
            let page = initialPage;
            const visited = new Set<string>();
            while (true) {
                if (page.error) throw new Error(page.error.message);
                for (const comment of page.data || []) {
                    await processComment(comment, parentId);
                }
                const next = page.paging?.next;
                if (!next || visited.has(next)) break;
                visited.add(next);
                page = await metaJson<CommentPage>(accessToken, next);
            }
        };

        await processPage(await metaJson<CommentPage>(accessToken, url));

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
