/**
 * Pinterest Trends API
 * Why: Exposes Pinterest trending topics and product categories to the frontend.
 * Uses the first connected Pinterest account's access token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ensureValidToken } from '@/lib/services/token-service';

/**
 * GET /api/trends/pinterest — Fetch Pinterest trending topics and categories
 * Query params: region (default: US)
 */
export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region') || 'US';

    // Why: Use the first active Pinterest account in the org for auth
    const pinterestAccount = await db.socialAccount.findFirst({
        where: {
            organizationId: session.user.currentOrganizationId,
            platform: 'PINTEREST',
            isActive: true,
        },
    });

    if (!pinterestAccount) {
        return NextResponse.json(
            { error: 'No Pinterest account connected' },
            { status: 404 }
        );
    }

    const tokenResult = await ensureValidToken(pinterestAccount.id);
    if (!tokenResult.success || !tokenResult.accessToken) {
        return NextResponse.json({ error: 'Token refresh failed' }, { status: 401 });
    }

    const {
        getPinterestTrendingTopics,
        getPinterestTrendingCategories,
    } = await import('@/lib/platform-api/pinterest-api');

    const [topicsResult, categoriesResult] = await Promise.all([
        getPinterestTrendingTopics(tokenResult.accessToken, region),
        getPinterestTrendingCategories(tokenResult.accessToken, region),
    ]);

    if (!topicsResult.success && !categoriesResult.success) {
        logger.error(
            { topicsError: topicsResult.error, categoriesError: categoriesResult.error },
            'Pinterest trends fetch failed'
        );
        return NextResponse.json(
            { error: topicsResult.error || categoriesResult.error },
            { status: 502 }
        );
    }

    return NextResponse.json({
        topics: topicsResult.data || [],
        categories: categoriesResult.data || [],
        region,
    });
}
