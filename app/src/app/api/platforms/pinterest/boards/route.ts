/**
 * Pinterest Boards API
 * Fetches boards for a connected Pinterest account
 * 
 * Why: Required for Pinterest posts - pins must be added to a board
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

interface PinterestBoard {
    id: string;
    name: string;
    description?: string;
    privacy: 'PUBLIC' | 'SECRET' | 'PROTECTED';
    pinCount?: number;
    followerCount?: number;
    imageUrl?: string;
}

interface PinterestBoardsResponse {
    items?: Array<{
        id: string;
        name: string;
        description?: string;
        privacy: 'PUBLIC' | 'SECRET' | 'PROTECTED';
        pin_count?: number;
        follower_count?: number;
        media?: {
            image_cover_url?: string;
        };
    }>;
    bookmark?: string;
    code?: number;
    message?: string;
}

/**
 * GET /api/platforms/pinterest/boards
 * Query params:
 *   - accountId: Social account ID for the Pinterest account
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

        // Fetch the Pinterest account with access token
        const account = await db.socialAccount.findFirst({
            where: {
                id: accountId,
                workspaceId: session.user.currentWorkspaceId,
                platform: 'PINTEREST',
            },
        });

        if (!account) {
            return NextResponse.json({ error: 'Pinterest account not found' }, { status: 404 });
        }

        // Check token expiry and refresh if needed
        let accessToken = account.accessToken;
        if (account.tokenExpiry && new Date(account.tokenExpiry) < new Date()) {
            // Token expired - attempt refresh
            const refreshedToken = await refreshPinterestToken(
                account.refreshToken,
                session.user.currentWorkspaceId
            );
            if (refreshedToken) {
                accessToken = refreshedToken.accessToken;
                // Update stored tokens
                await db.socialAccount.update({
                    where: { id: accountId },
                    data: {
                        accessToken: refreshedToken.accessToken,
                        refreshToken: refreshedToken.refreshToken || account.refreshToken,
                        tokenExpiry: refreshedToken.expiry,
                    },
                });
            } else {
                return NextResponse.json(
                    { error: 'Pinterest access token expired. Please reconnect your account.' },
                    { status: 401 }
                );
            }
        }

        // Fetch boards from Pinterest API v5
        const boards = await fetchPinterestBoards(accessToken);

        return NextResponse.json({ boards });
    } catch (error) {
        logger.error({ err: error }, 'Failed to fetch Pinterest boards');
        return NextResponse.json(
            { error: 'Failed to fetch Pinterest boards' },
            { status: 500 }
        );
    }
}

/**
 * Fetch boards from Pinterest API v5
 */
async function fetchPinterestBoards(accessToken: string): Promise<PinterestBoard[]> {
    const boards: PinterestBoard[] = [];
    let bookmark: string | undefined;

    do {
        const url = new URL('https://api.pinterest.com/v5/boards');
        url.searchParams.set('page_size', '100');
        if (bookmark) {
            url.searchParams.set('bookmark', bookmark);
        }

        const response = await fetch(url.toString(), {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        const data: PinterestBoardsResponse = await response.json();

        if (data.code && data.message) {
            logger.error({ code: data.code, message: data.message }, 'Pinterest API error');
            throw new Error(data.message);
        }

        if (data.items) {
            boards.push(
                ...data.items.map((item) => ({
                    id: item.id,
                    name: item.name,
                    description: item.description || undefined,
                    privacy: item.privacy,
                    pinCount: item.pin_count,
                    followerCount: item.follower_count,
                    imageUrl: item.media?.image_cover_url,
                }))
            );
        }

        bookmark = data.bookmark;
    } while (bookmark && boards.length < 500); // Cap at 500 boards

    // Sort boards alphabetically by name for better UX
    boards.sort((a, b) => a.name.localeCompare(b.name));

    return boards;
}

/**
 * Refresh Pinterest access token using refresh token
 * Pinterest tokens use the standard OAuth2 refresh flow
 */
async function refreshPinterestToken(
    refreshToken: string | null,
    workspaceId: string
): Promise<{ accessToken: string; refreshToken?: string; expiry: Date } | null> {
    if (!refreshToken) return null;

    try {
        // Get OAuth credentials from platform credentials
        const credentials = await db.platformCredential.findFirst({
            where: {
                workspaceId,
                platform: 'PINTEREST',
            },
        });

        if (!credentials) {
            logger.warn('Pinterest OAuth credentials not configured for workspace');
            return null;
        }

        // Base64 encode client_id:client_secret for Basic auth
        const authHeader = Buffer.from(
            `${credentials.clientId}:${credentials.clientSecret}`
        ).toString('base64');

        const response = await fetch('https://api.pinterest.com/v5/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${authHeader}`,
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
            }),
        });

        const data = await response.json();

        if (data.access_token) {
            return {
                accessToken: data.access_token,
                refreshToken: data.refresh_token, // Pinterest may issue a new refresh token
                expiry: new Date(Date.now() + (data.expires_in || 2592000) * 1000), // Default 30 days
            };
        }

        return null;
    } catch (error) {
        logger.error({ err: error }, 'Failed to refresh Pinterest token');
        return null;
    }
}
