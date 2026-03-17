/**
 * Trends Data API Route
 * Why: The SPA shell fetches this endpoint for client-side trends rendering.
 * Aggregates Google Trends, Instagram hashtag data, forecast, and trending sounds.
 * Supports `?force=true` to bust the Redis cache on demand.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
    detectTrends,
    getTrendForecast,
    getTrendingSounds,
    getTrendsLastUpdated,
    refreshTrends,
    getTrendsFreshness,
} from '@/lib/trends';
import { logger } from '@/lib/logger';

/**
 * Read the organization's niche keywords/hashtags if configured.
 * Why: Without niche data, relevance scoring and forecast are generic.
 * Sources keywords from ContentPillar names and BrandVoice guidelines.
 */
async function getOrgNiche(organizationId: string) {
    try {
        const [pillars, brandVoice] = await Promise.all([
            db.contentPillar.findMany({
                where: { organizationId },
                select: { name: true },
                take: 10,
            }),
            db.brandVoice.findUnique({
                where: { organizationId },
                select: { guidelines: true },
            }),
        ]);

        // Extract keywords from pillar names (e.g. "Fashion Tips" → ["fashion", "tips"])
        const pillarKeywords = pillars.flatMap(p =>
            p.name.toLowerCase().split(/\s+/).filter(w => w.length > 2)
        );

        // Extract first line of brand guidelines as a rough industry hint
        const guidelinesFirstLine = brandVoice?.guidelines?.split('\n')[0] ?? '';
        const guidelineWords = guidelinesFirstLine
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 3)
            .slice(0, 5);

        return {
            keywords: [...new Set([...pillarKeywords, ...guidelineWords])],
            hashtags: [] as string[],
            competitors: [] as string[],
            industries: [] as string[],
        };
    } catch {
        return { keywords: [], hashtags: [], competitors: [], industries: [] };
    }
}


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
    const forceRefresh = searchParams.get('force') === 'true';

    try {
        // Bust Redis cache if the user explicitly requested a refresh
        if (forceRefresh) {
            logger.info({ organizationId, country }, 'Force-refreshing trends cache');
            await refreshTrends(country);
        }

        const [socialAccounts, niche] = await Promise.all([
            db.socialAccount.findMany({
                where: { organizationId, isActive: true },
                select: { platform: true },
            }),
            getOrgNiche(organizationId),
        ]);

        const hasAccounts = socialAccounts.length > 0;
        const connectedPlatforms = socialAccounts.map(a => a.platform.toLowerCase());

        // Fetch trends, forecast, sounds, last-updated, and freshness in parallel
        const [allTrends, forecast, sounds, lastUpdated, freshness] = await Promise.all([
            detectTrends(organizationId, niche, connectedPlatforms, country),
            getTrendForecast(niche),
            getTrendingSounds('instagram', country),
            getTrendsLastUpdated(),
            getTrendsFreshness(),
        ]);

        // Apply optional server-side filters
        let trends = allTrends;

        if (platformFilter && platformFilter !== 'all') {
            trends = trends.filter(t => t.platform === platformFilter);
        }

        if (typeFilter && typeFilter !== 'all') {
            trends = trends.filter(t => t.type === typeFilter);
        }

        // Compute summary stats
        const risingCount = allTrends.filter(t => t.velocity === 'rising').length;
        const jumpNowCount = allTrends.filter(t => t.opportunityTier === 'jump_now').length;
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
            freshness,
            stats: {
                total: allTrends.length,
                rising: risingCount,
                jumpNow: jumpNowCount,
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

