/**
 * Pinterest Boards API
 * Fetches boards for a connected Pinterest account with server-side caching
 *
 * Why: Required for Pinterest posts — pins must be added to a board.
 *
 * Caching: Boards are cached for 24 hours to prevent rate limiting.
 * Use ?refresh=true to force a fresh fetch from Pinterest API.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ensureValidToken, handle401Error } from '@/lib/services/token-service';
import {
    fetchPinterestBoardsDirect,
    type PinterestBoard,
} from '@/lib/api/pinterest-boards';

/** Cache TTL: 24 hours in milliseconds */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/platforms/pinterest/boards
 * Query params:
 *   - accountId: Social account ID for the Pinterest account
 *   - refresh: If 'true', bypasses cache and fetches fresh data
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const accountId = request.nextUrl.searchParams.get('accountId');
        const forceRefresh = request.nextUrl.searchParams.get('refresh') === 'true';

        if (!accountId) {
            return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
        }

        // Verify the Pinterest account belongs to the org
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

        // Check cache first (unless force refresh requested)
        if (!forceRefresh) {
            const cachedData = await db.pinterestBoardCache.findUnique({
                where: { socialAccountId: accountId },
            });

            if (cachedData && new Date() < cachedData.expiresAt) {
                logger.info({ accountId, cachedAt: cachedData.cachedAt }, 'Returning cached Pinterest boards');
                return NextResponse.json({
                    boards: cachedData.boards as unknown as PinterestBoard[],
                    fromCache: true,
                    cachedAt: cachedData.cachedAt,
                });
            }
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

        const boards = result.boards!;

        // Persist to cache — Prisma Json field accepts plain objects directly
        const now = new Date();
        const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);

        await db.pinterestBoardCache.upsert({
            where: { socialAccountId: accountId },
            create: {
                socialAccountId: accountId,
                boards: boards as unknown as Record<string, unknown>[],
                cachedAt: now,
                expiresAt,
            },
            update: {
                boards: boards as unknown as Record<string, unknown>[],
                cachedAt: now,
                expiresAt,
            },
        });

        logger.info({ accountId, boardCount: boards.length }, 'Fetched and cached Pinterest boards');

        return NextResponse.json({
            boards,
            fromCache: false,
            cachedAt: now,
        });
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
 *
 * Why: OAuth tokens can expire between the `ensureValidToken` check
 * and the actual API call (race window). A single retry after
 * refreshing accounts for this edge case.
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

