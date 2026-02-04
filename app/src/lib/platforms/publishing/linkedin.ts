/**
 * LinkedIn Publisher
 * Why: LinkedIn-specific publishing logic (Posts, Articles).
 */

import { logger } from '../../logger';
import type { PlatformAccount, PublishPayload, PublishResponse } from '../types';

/**
 * Publish to LinkedIn
 */
export async function publishToLinkedIn(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    const { publishLinkedInPost, publishLinkedInArticle } = await import('@/lib/platform-api/linkedin-api');

    logger.debug({ platform: 'linkedin', postType: payload.postType, caption: payload.caption.slice(0, 50) }, 'Publishing to LinkedIn');

    // Construct LinkedIn URN from accountId
    let authorUrn = account.accountId;
    if (!authorUrn.startsWith('urn:li:')) {
        authorUrn = `urn:li:person:${account.accountId}`;
        logger.debug({ accountId: account.accountId, authorUrn }, 'Constructed LinkedIn URN from accountId');
    }

    // Route article posts
    if (payload.postType === 'article') {
        const result = await publishLinkedInArticle(
            account.accessToken,
            authorUrn,
            {
                title: payload.caption.slice(0, 200),
                text: payload.caption,
                url: payload.link,
            }
        );

        if (!result.success) {
            logger.error({ platform: 'linkedin', postType: 'article', error: result.error }, 'LinkedIn article publish failed');
            return { success: false, error: result.error };
        }

        return {
            success: true,
            postId: result.data?.id,
            postUrl: result.data?.id ? `https://linkedin.com/feed/update/${result.data.id}` : undefined,
        };
    }

    // Feed posts
    const result = await publishLinkedInPost(
        account.accessToken,
        authorUrn,
        {
            text: payload.caption,
            mediaUrls: payload.mediaUrls.length > 0 ? payload.mediaUrls : undefined,
            mediaType: payload.mediaType === 'video' ? 'video' : 'image',
            visibility: 'PUBLIC',
        }
    );

    if (!result.success) {
        logger.error({ platform: 'linkedin', error: result.error }, 'LinkedIn publish failed');
        return { success: false, error: result.error };
    }

    return {
        success: true,
        postId: result.data?.id,
        postUrl: result.data?.url,
    };
}
