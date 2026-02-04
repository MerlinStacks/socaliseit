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
import { ensureValidToken, handle401Error } from '@/lib/services/token-service';

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

        // Fetch the Pinterest account
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

        // Fetch boards with automatic 401 retry
        const result = await fetchBoardsWithRetry(accountId, tokenResult.accessToken!);

        if (!result.success) {
            return NextResponse.json(
                {
                    error: result.error || 'Failed to fetch boards',
                    needsReconnect: result.needsReconnect,
                },
                { status: result.needsReconnect ? 401 : 500 }
            );
        }

        return NextResponse.json({ boards: result.boards });
    } catch (error) {
        logger.error({ err: error }, 'Failed to fetch Pinterest boards');
        return NextResponse.json(
            { error: 'Failed to fetch Pinterest boards' },
            { status: 500 }
        );
    }
}

/**
 * Fetch boards with automatic 401 error handling and retry.
 */
async function fetchBoardsWithRetry(
    accountId: string,
    accessToken: string,
    isRetry = false
): Promise<{ success: boolean; boards?: PinterestBoard[]; error?: string; needsReconnect?: boolean }> {
    try {
        const boards = await fetchPinterestBoards(accessToken);
        return { success: true, boards };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Check if it's an authentication error
        if (errorMessage.includes('401') || errorMessage.includes('authentication') || errorMessage.includes('Unauthorized')) {
            if (isRetry) {
                return {
                    success: false,
                    error: 'Authentication failed after retry. Please reconnect your Pinterest account.',
                    needsReconnect: true,
                };
            }

            // Attempt to refresh token and retry
            logger.info({ accountId }, 'Received 401, attempting token refresh and retry');
            const refreshResult = await handle401Error(accountId, errorMessage);

            if (refreshResult.success && refreshResult.accessToken) {
                return fetchBoardsWithRetry(accountId, refreshResult.accessToken, true);
            }

            return {
                success: false,
                error: refreshResult.error || 'Authentication failed',
                needsReconnect: true,
            };
        }

        return { success: false, error: errorMessage };
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
