/**
 * Trends Data API Route
 * Why: The SPA shell fetches this endpoint for client-side trends rendering.
 * Aggregates Google Trends, Instagram hashtag data, forecast, and trending sounds.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { detectTrends, getTrendForecast, getTrendingSounds, getTrendsLastUpdated } from '@/lib/trends';
import { logger } from '@/lib/logger';

/** GET /api/trends/data */
export async function GET(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;
    const { searchParams } = new URL(request.url);
    const platformFilter = searchParams.get('platform') || undefined;
    const typeFilter = searchParams.get('type') || undefined;
    const country = searchParams.get('country') || 'AU';

    try {
        const socialAccounts = await db.socialAccount.findMany({
            where: { organizationId, isActive: true },
            select: { platform: true },
        });

        const hasAccounts = socialAccounts.length > 0;
        const connectedPlatforms = socialAccounts.map(a => a.platform.toLowerCase());

        // Fetch trends, forecast, and sounds in parallel
        const [allTrends, forecast, sounds, lastUpdated] = await Promise.all([
            detectTrends(organizationId, {
                keywords: [],
                hashtags: [],
                competitors: [],
                industries: [],
            }, connectedPlatforms, country),
            getTrendForecast({
                keywords: [],
                hashtags: [],
                competitors: [],
                industries: [],
            }),
            getTrendingSounds('instagram', country),
            getTrendsLastUpdated(),
        ]);

        // Apply client-side filters
        let trends = allTrends;

        if (platformFilter && platformFilter !== 'all') {
            trends = trends.filter(t => t.platform === platformFilter);
        }

        if (typeFilter && typeFilter !== 'all') {
            trends = trends.filter(t => t.type === typeFilter);
        }

        // Compute summary stats
        const risingCount = allTrends.filter(t => t.velocity === 'rising').length;
        const platformCounts: Record<string, number> = {};
        for (const t of allTrends) {
            platformCounts[t.platform] = (platformCounts[t.platform] || 0) + 1;
        }
        const topPlatform = Object.entries(platformCounts)
            .sort((a, b) => b[1] - a[1])[0]?.[0] || 'google';

        return NextResponse.json({
            trends,
            forecast,
            sounds,
            hasAccounts,
            platforms: [...new Set(connectedPlatforms)],
            lastUpdated: lastUpdated?.toISOString() || null,
            stats: {
                total: allTrends.length,
                rising: risingCount,
                topPlatform,
            },
        }, {
            headers: {
                'Cache-Control': 'private, max-age=120, stale-while-revalidate=300',
            },
        });
    } catch (error) {
        logger.error({ error, organizationId }, 'Failed to fetch trends data');
        return NextResponse.json({ error: 'Failed to fetch trends' }, { status: 500 });
    }
}
