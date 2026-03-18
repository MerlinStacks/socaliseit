/**
 * Avatar Refresh Service
 * Re-fetches profile picture URLs from platform APIs and persists them.
 *
 * Why: Facebook, Instagram, and Threads CDN avatar URLs are signed with
 * temporary tokens. After expiry (typically a few hours to days) they
 * return HTTP 403. This service uses the account's valid access token to
 * fetch a fresh URL and update the database.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { GRAPH_API_URL } from '@/lib/platform-api/constants';

type Platform = 'INSTAGRAM' | 'FACEBOOK' | 'THREADS' | string;

interface RefreshResult {
    updated: boolean;
    newUrl?: string;
    error?: string;
}

/**
 * Fetch a fresh profile picture URL from the platform API.
 * Only Meta-family platforms (Instagram, Facebook, Threads) have expiring CDNs.
 */
async function fetchFreshAvatarUrl(
    platform: Platform,
    platformId: string,
    accessToken: string,
): Promise<string | null> {
    try {
        switch (platform) {
            case 'INSTAGRAM': {
                const url = `${GRAPH_API_URL}/${platformId}?fields=profile_picture_url&access_token=${accessToken}`;
                const res = await fetch(url);
                if (!res.ok) return null;
                const data = await res.json();
                return data.profile_picture_url ?? null;
            }

            case 'FACEBOOK': {
                const url = `${GRAPH_API_URL}/${platformId}/picture?redirect=false&type=small&access_token=${accessToken}`;
                const res = await fetch(url);
                if (!res.ok) return null;
                const data = await res.json();
                return data.data?.url ?? null;
            }

            case 'THREADS': {
                const url = `https://graph.threads.net/v1.0/me?fields=threads_profile_picture_url&access_token=${accessToken}`;
                const res = await fetch(url);
                if (!res.ok) return null;
                const data = await res.json();
                return data.threads_profile_picture_url ?? null;
            }

            default:
                // Other platforms (YouTube, TikTok, etc.) serve stable avatar URLs
                return null;
        }
    } catch (err) {
        logger.warn({ err, platform, platformId }, 'Failed to fetch fresh avatar URL');
        return null;
    }
}

/**
 * Re-fetches and persists the profile picture for a social account.
 * Skips platforms that don't have expiring CDN URLs.
 */
export async function refreshAccountAvatar(accountId: string): Promise<RefreshResult> {
    const account = await db.socialAccount.findUnique({
        where: { id: accountId },
        select: {
            id: true,
            platform: true,
            platformId: true,
            accessToken: true,
            avatar: true,
        },
    });

    if (!account) {
        return { updated: false, error: 'Account not found' };
    }

    // Why: Only Meta-family platforms use signed CDN URLs that expire
    const metaPlatforms = ['INSTAGRAM', 'FACEBOOK', 'THREADS'];
    if (!metaPlatforms.includes(account.platform)) {
        return { updated: false };
    }

    const freshUrl = await fetchFreshAvatarUrl(
        account.platform,
        account.platformId,
        account.accessToken,
    );

    if (!freshUrl) {
        return { updated: false, error: 'Could not fetch fresh avatar URL' };
    }

    // Why: Skip the DB write if the URL hasn't changed (avoids unnecessary updatedAt bumps)
    if (freshUrl === account.avatar) {
        return { updated: false };
    }

    await db.socialAccount.update({
        where: { id: accountId },
        data: { avatar: freshUrl },
    });

    logger.info(
        { accountId, platform: account.platform },
        'Refreshed social account avatar URL',
    );

    return { updated: true, newUrl: freshUrl };
}
