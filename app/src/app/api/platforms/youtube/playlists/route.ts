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
        if (!session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const accountId = request.nextUrl.searchParams.get('accountId');
        if (!accountId) {
            return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
        }

        // Fetch the YouTube account with access token
        const account = await db.socialAccount.findFirst({
            where: {
                id: accountId,
                workspaceId: session.user.currentWorkspaceId,
                platform: 'YOUTUBE',
            },
        });

        if (!account) {
            return NextResponse.json({ error: 'YouTube account not found' }, { status: 404 });
        }

        // Check token expiry and refresh if needed
        let accessToken = account.accessToken;
        if (account.tokenExpiry && new Date(account.tokenExpiry) < new Date()) {
            // Token expired - attempt refresh
            const refreshedToken = await refreshYouTubeToken(account.refreshToken);
            if (refreshedToken) {
                accessToken = refreshedToken.accessToken;
                // Update stored tokens
                await db.socialAccount.update({
                    where: { id: accountId },
                    data: {
                        accessToken: refreshedToken.accessToken,
                        tokenExpiry: refreshedToken.expiry,
                    },
                });
            } else {
                return NextResponse.json(
                    { error: 'YouTube access token expired. Please reconnect your account.' },
                    { status: 401 }
                );
            }
        }

        // Fetch playlists from YouTube Data API v3
        const playlists = await fetchYouTubePlaylists(accessToken, account.platformId);

        return NextResponse.json({ playlists });
    } catch (error) {
        logger.error({ err: error }, 'Failed to fetch YouTube playlists');
        return NextResponse.json(
            { error: 'Failed to fetch YouTube playlists' },
            { status: 500 }
        );
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

/**
 * Refresh YouTube access token using refresh token
 */
async function refreshYouTubeToken(
    refreshToken: string | null
): Promise<{ accessToken: string; expiry: Date } | null> {
    if (!refreshToken) return null;

    try {
        // Get OAuth credentials from platform credentials
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            logger.warn('Google OAuth credentials not configured');
            return null;
        }

        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            }),
        });

        const data = await response.json();

        if (data.access_token) {
            return {
                accessToken: data.access_token,
                expiry: new Date(Date.now() + (data.expires_in || 3600) * 1000),
            };
        }

        return null;
    } catch (error) {
        logger.error({ err: error }, 'Failed to refresh YouTube token');
        return null;
    }
}
