/**
 * YouTube Playlists API
 * Fetches playlists for a connected YouTube account
 *
 * Why: Allows users to add videos to playlists when publishing to YouTube
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ensureValidToken, handle401Error } from '@/lib/services/token-service';

interface YouTubePlaylist {
    id: string;
    title: string;
    description?: string;
    thumbnailUrl?: string;
    itemCount?: number;
}

interface YouTubePlaylistsResponse {
    items?: Array<{
        id: string;
        snippet: {
            title: string;
            description?: string;
            thumbnails?: {
                default?: { url: string };
            };
        };
        contentDetails?: {
            itemCount: number;
        };
    }>;
    nextPageToken?: string;
    error?: {
        code: number;
        message: string;
    };
}

/**
 * GET /api/platforms/youtube/playlists
 * Query params:
 *   - accountId: Social account ID for the YouTube channel
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const accountId = request.nextUrl.searchParams.get('accountId');
        if (!accountId) {
            return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
        }

        // Fetch the YouTube account
        const account = await db.socialAccount.findFirst({
            where: {
                id: accountId,
                organizationId: session.user.currentOrganizationId,
                platform: 'YOUTUBE',
            },
        });

        if (!account) {
            return NextResponse.json({ error: 'YouTube account not found' }, { status: 404 });
        }

        // Proactively ensure we have a valid token (refreshes if expiring soon)
        const tokenResult = await ensureValidToken(accountId);
        if (!tokenResult.success) {
            return NextResponse.json(
                {
                    error: tokenResult.error || 'Authentication failed',
                    needsReconnect: tokenResult.needsReconnect,
                },
                { status: 401 }
            );
        }

        // Fetch playlists with automatic 401 retry
        const result = await fetchPlaylistsWithRetry(
            accountId,
            tokenResult.accessToken!,
            account.platformId
        );

        if (!result.success) {
            return NextResponse.json(
                {
                    error: result.error || 'Failed to fetch playlists',
                    needsReconnect: result.needsReconnect,
                },
                { status: result.needsReconnect ? 401 : 500 }
            );
        }

        return NextResponse.json({ playlists: result.playlists });
    } catch (error) {
        logger.error({ err: error }, 'Failed to fetch YouTube playlists');
        return NextResponse.json(
            { error: 'Failed to fetch YouTube playlists' },
            { status: 500 }
        );
    }
}

/**
 * Fetch playlists with automatic 401 error handling and retry.
 */
async function fetchPlaylistsWithRetry(
    accountId: string,
    accessToken: string,
    channelId: string,
    isRetry = false
): Promise<{ success: boolean; playlists?: YouTubePlaylist[]; error?: string; needsReconnect?: boolean }> {
    try {
        const playlists = await fetchYouTubePlaylists(accessToken, channelId);
        return { success: true, playlists };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Check if it's an authentication error
        if (errorMessage.includes('401') || errorMessage.includes('authentication') || errorMessage.includes('Invalid Credentials')) {
            if (isRetry) {
                // Already retried once, give up
                return {
                    success: false,
                    error: 'Authentication failed after retry. Please reconnect your YouTube account.',
                    needsReconnect: true,
                };
            }

            // Attempt to refresh token and retry
            logger.info({ accountId }, 'Received 401, attempting token refresh and retry');
            const refreshResult = await handle401Error(accountId, errorMessage);

            if (refreshResult.success && refreshResult.accessToken) {
                // Retry with new token
                return fetchPlaylistsWithRetry(accountId, refreshResult.accessToken, channelId, true);
            }

            return {
                success: false,
                error: refreshResult.error || 'Authentication failed',
                needsReconnect: true,
            };
        }

        // Non-auth error
        return { success: false, error: errorMessage };
    }
}

/**
 * Fetch playlists from YouTube Data API v3
 */
async function fetchYouTubePlaylists(
    accessToken: string,
    channelId: string
): Promise<YouTubePlaylist[]> {
    const playlists: YouTubePlaylist[] = [];
    let nextPageToken: string | undefined;

    do {
        const url = new URL('https://www.googleapis.com/youtube/v3/playlists');
        url.searchParams.set('part', 'snippet,contentDetails');
        url.searchParams.set('channelId', channelId);
        url.searchParams.set('maxResults', '50');
        if (nextPageToken) {
            url.searchParams.set('pageToken', nextPageToken);
        }

        const response = await fetch(url.toString(), {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        const data: YouTubePlaylistsResponse = await response.json();

        if (data.error) {
            logger.error({ err: data.error }, 'YouTube API error');
            throw new Error(data.error.message);
        }

        if (data.items) {
            playlists.push(
                ...data.items.map((item) => ({
                    id: item.id,
                    title: item.snippet.title,
                    description: item.snippet.description || undefined,
                    thumbnailUrl: item.snippet.thumbnails?.default?.url,
                    itemCount: item.contentDetails?.itemCount,
                }))
            );
        }

        nextPageToken = data.nextPageToken;
    } while (nextPageToken && playlists.length < 200); // Cap at 200 playlists

    return playlists;
}
