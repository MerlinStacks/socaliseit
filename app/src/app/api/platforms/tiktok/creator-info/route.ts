/**
 * TikTok Creator Info API Route
 * Why: The compose UI needs creator info to populate privacy options,
 * check rate limits, and validate video duration per TikTok guidelines.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ensureValidToken, handle401Error } from '@/lib/services/token-service';
import { getTikTokCreatorInfo, type TikTokCreatorInfo } from '@/lib/platform-api/tiktok-creator-info';

/**
 * GET /api/platforms/tiktok/creator-info
 * Query params:
 *   - accountId: Social account ID for the TikTok account
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

        const account = await db.socialAccount.findFirst({
            where: {
                id: accountId,
                organizationId: session.user.currentOrganizationId,
                platform: 'TIKTOK',
            },
        });

        if (!account) {
            return NextResponse.json({ error: 'TikTok account not found' }, { status: 404 });
        }

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

        const result = await fetchCreatorInfoWithRetry(
            accountId,
            tokenResult.accessToken!
        );

        if (!result.success) {
            return NextResponse.json(
                {
                    error: result.error || 'Failed to fetch creator info',
                    needsReconnect: result.needsReconnect,
                },
                { status: result.needsReconnect ? 401 : 500 }
            );
        }

        return NextResponse.json({ creatorInfo: result.creatorInfo });
    } catch (error) {
        logger.error({ err: error }, 'Failed to fetch TikTok creator info');
        return NextResponse.json(
            { error: 'Failed to fetch TikTok creator info' },
            { status: 500 }
        );
    }
}

/**
 * Fetch creator info with automatic 401 error handling and retry.
 * Why: Mirrors the pattern used in YouTube playlists and Pinterest boards routes.
 */
async function fetchCreatorInfoWithRetry(
    accountId: string,
    accessToken: string,
    isRetry = false
): Promise<{ success: boolean; creatorInfo?: TikTokCreatorInfo; error?: string; needsReconnect?: boolean }> {
    const result = await getTikTokCreatorInfo(accessToken);

    if (result.success) {
        return { success: true, creatorInfo: result.data };
    }

    const errorMessage = result.error || 'Unknown error';

    if (
        errorMessage.includes('401') ||
        errorMessage.includes('authentication') ||
        result.errorCode === 'access_token_invalid'
    ) {
        if (isRetry) {
            return {
                success: false,
                error: 'Authentication failed after retry. Please reconnect your TikTok account.',
                needsReconnect: true,
            };
        }

        logger.info({ accountId }, 'TikTok creator_info 401, attempting token refresh');
        const refreshResult = await handle401Error(accountId, errorMessage);

        if (refreshResult.success && refreshResult.accessToken) {
            return fetchCreatorInfoWithRetry(accountId, refreshResult.accessToken, true);
        }

        return {
            success: false,
            error: refreshResult.error || 'Authentication failed',
            needsReconnect: true,
        };
    }

    return { success: false, error: errorMessage };
}
