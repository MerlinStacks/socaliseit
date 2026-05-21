/**
 * Instagram Collaboration Invites
 * Why: Instagram Collabs API lets creators manage collaboration invites
 * for co-authored posts, Reels, and Stories. This enables accepting/declining
 * invites programmatically instead of requiring manual in-app action.
 *
 * Requires: `instagram_manage_contents` permission.
 * @see https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/collab_posts
 */

import { ApiResponse } from '../types';
import { GRAPH_API_URL } from './constants';
import { logger } from '@/lib/logger';
import { metaFetch, metaJson } from '../meta-fetch';

/** Represents a pending collaboration invite */
export interface InstagramCollabInvite {
    mediaId: string;
    mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REELS';
    permalink: string;
    caption?: string;
    timestamp: string;
    inviterUsername: string;
    inviterId: string;
}

/**
 * Fetch pending collaboration invites for an Instagram Business/Creator account.
 *
 * Why: Users need to see and act on collab invites from the dashboard
 * instead of switching to the Instagram app.
 */
export async function getInstagramCollabInvites(
    accessToken: string,
    instagramUserId: string
): Promise<ApiResponse<InstagramCollabInvite[]>> {
    try {
        const fields = 'id,media_type,permalink,caption,timestamp,owner{id,username}';
        const url = `${GRAPH_API_URL}/${instagramUserId}/collab_posts?fields=${fields}`;

        const data = await metaJson(accessToken, url);

        if (data.error) {
            logger.error(
                { error: data.error, instagramUserId },
                '[Instagram Collabs] Failed to fetch collab invites'
            );
            return { success: false, error: data.error.message, errorCode: data.error.code };
        }

        const invites: InstagramCollabInvite[] = (data.data || []).map(
            (item: Record<string, unknown>) => ({
                mediaId: item.id as string,
                mediaType: item.media_type as string,
                permalink: item.permalink as string,
                caption: item.caption as string | undefined,
                timestamp: item.timestamp as string,
                inviterUsername: (item.owner as Record<string, string>)?.username || '',
                inviterId: (item.owner as Record<string, string>)?.id || '',
            })
        );

        return { success: true, data: invites };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: message }, '[Instagram Collabs] Error fetching collab invites');
        return { success: false, error: message };
    }
}

/**
 * Accept or decline a collaboration invite.
 *
 * Why: The Graph API requires a POST to the media's collab_posts edge
 * with an `action` field set to either "accept" or "decline".
 */
export async function respondToInstagramCollab(
    accessToken: string,
    mediaId: string,
    action: 'accept' | 'decline'
): Promise<ApiResponse<{ success: boolean }>> {
    try {
        const url = `${GRAPH_API_URL}/${mediaId}/collab_posts`;

        const response = await metaFetch(accessToken, url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
        });

        const data = await response.json();

        if (data.error) {
            logger.error(
                { error: data.error, mediaId, action },
                '[Instagram Collabs] Failed to respond to collab invite'
            );
            return { success: false, error: data.error.message, errorCode: data.error.code };
        }

        logger.info(
            { mediaId, action },
            `[Instagram Collabs] Collab invite ${action}ed`
        );

        return { success: true, data: { success: true } };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: message, mediaId }, '[Instagram Collabs] Error responding to collab');
        return { success: false, error: message };
    }
}
