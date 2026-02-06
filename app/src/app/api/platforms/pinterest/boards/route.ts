/**
 * Pinterest Boards API
 * Fetches boards for a connected Pinterest account
 *
 * Why: Required for Pinterest posts - pins must be added to a board
 * 
 * Supports two connection methods:
 * 1. Late.dev connected accounts (token starts with 'late:') - Uses Late.dev API
 * 2. Direct OAuth accounts - Uses Pinterest API v5 directly
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decrypt } from '@/lib/crypto';
import { ensureValidToken, handle401Error } from '@/lib/services/token-service';

const LATE_API_BASE = 'https://getlate.dev/api/v1';

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

interface LateBoardsResponse {
    boards?: Array<{
        id: string;
        name: string;
        description?: string;
        privacy?: string;
    }>;
    error?: string;
}

/**
 * GET /api/platforms/pinterest/boards
 * Query params:
 *   - accountId: Social account ID for the Pinterest account
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

        // Fetch the Pinterest account
        const account = await db.socialAccount.findFirst({
            where: {
                id: accountId,
                organizationId: session.user.currentOrganizationId,
                platform: 'PINTEREST',
            },
        });

        if (!account) {
            return NextResponse.json({ error: 'Pinterest account not found' }, { status: 404 });
        }

        // Check if this is a Late.dev connected account
        // Late.dev accounts store the token as 'late:{lateAccountId}'
        if (account.accessToken?.startsWith('late:')) {
            const lateAccountId = account.accessToken.replace('late:', '');
            const result = await fetchBoardsFromLateDev(lateAccountId);

            if (!result.success) {
                return NextResponse.json(
                    { error: result.error || 'Failed to fetch boards from Late.dev' },
                    { status: 500 }
                );
            }

            return NextResponse.json({ boards: result.boards });
        }

        // Direct OAuth account - use Pinterest API v5
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
 * Fetch boards from Late.dev API for accounts connected via Late.dev
 * 
 * Why: Late.dev manages the OAuth tokens internally, so we call their API
 * which handles authentication automatically using our API key.
 */
async function fetchBoardsFromLateDev(
    lateAccountId: string
): Promise<{ success: boolean; boards?: PinterestBoard[]; error?: string }> {
    try {
        logger.info({ lateAccountId }, 'Fetching Pinterest boards from Late.dev');

        // Get Late.dev API key from global settings
        const settings = await db.globalIntegrationSettings.findUnique({
            where: { id: 'global_integration_settings' },
        });

        if (!settings?.lateApiKey) {
            logger.error('Late.dev API key not configured');
            return { success: false, error: 'Late.dev integration not configured' };
        }

        const lateApiKey = decrypt(settings.lateApiKey);
        const apiUrl = `${LATE_API_BASE}/accounts/${lateAccountId}/pinterest-boards`;

        logger.info({ lateAccountId, apiUrl }, 'Calling Late.dev Pinterest boards API');

        // Call Late.dev's Pinterest boards endpoint
        const response = await fetch(apiUrl, {
            headers: {
                'Authorization': `Bearer ${lateApiKey}`,
            },
        });

        logger.info(
            { lateAccountId, status: response.status, statusText: response.statusText },
            'Late.dev Pinterest boards API response status'
        );

        if (!response.ok) {
            const errorText = await response.text();
            logger.error(
                { status: response.status, error: errorText, lateAccountId, apiUrl },
                'Late.dev Pinterest boards API error'
            );
            return {
                success: false,
                error: response.status === 401
                    ? 'Late.dev authentication failed. Please check API key configuration.'
                    : `Failed to fetch boards from Late.dev (${response.status}): ${errorText}`,
            };
        }

        const responseText = await response.text();
        logger.info(
            { lateAccountId, responseLength: responseText.length, preview: responseText.substring(0, 500) },
            'Late.dev Pinterest boards API raw response'
        );

        let data: LateBoardsResponse;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            logger.error(
                { lateAccountId, responseText, parseError },
                'Failed to parse Late.dev response as JSON'
            );
            return { success: false, error: 'Invalid response from Late.dev API' };
        }

        logger.info(
            { lateAccountId, hasBoards: !!data.boards, boardCount: data.boards?.length ?? 0, error: data.error },
            'Late.dev Pinterest boards API parsed response'
        );

        if (data.error) {
            return { success: false, error: data.error };
        }

        // Map Late.dev response to our board format
        const boards: PinterestBoard[] = (data.boards || []).map((board) => ({
            id: board.id,
            name: board.name,
            description: board.description,
            privacy: (board.privacy as 'PUBLIC' | 'SECRET' | 'PROTECTED') || 'PUBLIC',
        }));

        // Sort boards alphabetically
        boards.sort((a, b) => a.name.localeCompare(b.name));

        logger.info({ lateAccountId, boardCount: boards.length }, 'Successfully fetched Pinterest boards from Late.dev');
        return { success: true, boards };
    } catch (error) {
        logger.error({ err: error, lateAccountId }, 'Failed to fetch Pinterest boards from Late.dev');
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error fetching boards',
        };
    }
}

/**
 * Fetch boards with automatic 401 error handling and retry.
 * Used for direct OAuth connected accounts.
 */
async function fetchBoardsWithRetry(
    accountId: string,
    accessToken: string,
    isRetry = false
): Promise<{ success: boolean; boards?: PinterestBoard[]; error?: string; needsReconnect?: boolean }> {
    try {
        const boards = await fetchPinterestBoardsDirect(accessToken);
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
 * Fetch boards from Pinterest API v5 directly
 * Used for accounts connected via direct OAuth (not Late.dev)
 */
async function fetchPinterestBoardsDirect(accessToken: string): Promise<PinterestBoard[]> {
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
