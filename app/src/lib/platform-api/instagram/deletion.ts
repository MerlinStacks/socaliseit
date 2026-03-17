/**
 * Instagram Media Deletion
 * Why: The Graph API now supports deleting published Instagram media
 * (posts, stories, reels, carousel albums) programmatically. Previously
 * this could only be done from the Instagram app.
 *
 * Limitation: Cannot delete individual items from a carousel — only the
 * entire carousel album can be deleted as a unit.
 *
 * Requires: `instagram_manage_contents` permission.
 * @see https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-media
 */

import { ApiResponse } from '../types';
import { GRAPH_API_URL } from './constants';
import { logger } from '@/lib/logger';

/**
 * Delete an Instagram media object (post, story, reel, or carousel album).
 *
 * Why: Allows users to remove published content from Instagram directly
 * from the dashboard without opening the Instagram app. Useful for crisis
 * response, content moderation, or removing underperforming posts.
 *
 * @param accessToken - Page access token with instagram_manage_contents permission
 * @param mediaId - The IG Media ID to delete
 * @returns Success/failure response
 */
export async function deleteInstagramMedia(
    accessToken: string,
    mediaId: string
): Promise<ApiResponse<{ deleted: boolean }>> {
    try {
        const url = `${GRAPH_API_URL}/${mediaId}?access_token=${accessToken}`;

        const response = await fetch(url, { method: 'DELETE' });
        const data = await response.json();

        if (data.error) {
            logger.error(
                { error: data.error, mediaId },
                '[Instagram Deletion] Failed to delete media'
            );
            return { success: false, error: data.error.message, errorCode: data.error.code };
        }

        // Why: Graph API returns { success: true } on successful deletion
        if (data.success === true) {
            logger.info({ mediaId }, '[Instagram Deletion] Media deleted successfully');
            return { success: true, data: { deleted: true } };
        }

        return {
            success: false,
            error: 'Unexpected response from Instagram deletion API',
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: message, mediaId }, '[Instagram Deletion] Error deleting media');
        return { success: false, error: message };
    }
}
