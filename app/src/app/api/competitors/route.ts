/**
 * Competitors API Route
 * CRUD operations for competitor tracking with rate limiting
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { scrapeInstagramProfile } from '@/lib/scrapers/instagram-scraper';
import { logger } from '@/lib/logger';

/**
 * Rate limiting: Max 5 competitor adds per organization per hour
 */
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_ADDS = 5;

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(organizationId: string): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();
    const entry = rateLimitMap.get(organizationId);

    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(organizationId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return { allowed: true };
    }

    if (entry.count >= RATE_LIMIT_MAX_ADDS) {
        return { allowed: false, retryAfterMs: entry.resetAt - now };
    }

    entry.count++;
    return { allowed: true };
}

/**
 * GET /api/competitors - List tracked competitors
 */
export async function GET() {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;

    const competitors = await db.competitor.findMany({
        where: { organizationId },
        orderBy: { followers: 'desc' }
    });

    const formattedCompetitors = competitors.map(comp => ({
        id: comp.id,
        username: comp.username,
        displayName: comp.displayName,
        avatar: comp.avatar,
        platform: comp.platform.toLowerCase(),
        followers: comp.followers,
        followerGrowth: comp.followerGrowth,
        avgEngagement: comp.avgEngagement,
        postsPerWeek: comp.postsPerWeek,
        isVerified: comp.isVerified,
        lastSynced: comp.lastSyncedAt?.toISOString() || null
    }));

    return NextResponse.json({
        competitors: formattedCompetitors,
        total: competitors.length
    });
}

/**
 * POST /api/competitors - Add a competitor to track
 * Rate limited to prevent abuse and reduce scraping detection risk
 */
export async function POST(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;
    const userId = session.user.id;
    const userName = session.user.name || 'Unknown';

    // Check rate limit
    const rateCheck = checkRateLimit(organizationId);
    if (!rateCheck.allowed) {
        const retryAfterSeconds = Math.ceil((rateCheck.retryAfterMs || 0) / 1000);
        return NextResponse.json(
            { error: `Rate limit exceeded. Try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.` },
            { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
        );
    }

    const body = await request.json();
    const { username, platform } = body;

    if (!username || !platform) {
        return NextResponse.json({ error: 'Username and platform are required' }, { status: 400 });
    }

    const validPlatforms = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'YOUTUBE', 'PINTEREST', 'GOOGLE_BUSINESS'];
    const platformUpper = platform.toUpperCase();

    if (!validPlatforms.includes(platformUpper)) {
        return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }

    const cleanUsername = username.toLowerCase().replace('@', '');

    // Check for duplicate
    const existing = await db.competitor.findUnique({
        where: {
            organizationId_platform_username: {
                organizationId,
                platform: platformUpper,
                username: cleanUsername
            }
        }
    });

    if (existing) {
        return NextResponse.json({ error: 'Already tracking this competitor' }, { status: 400 });
    }

    // Scrape profile data (Instagram only for now)
    let scrapedData: {
        displayName: string;
        followers: number;
        avatar: string | null;
        isVerified: boolean;
    } = {
        displayName: username,
        followers: 0,
        avatar: null,
        isVerified: false
    };

    if (platformUpper === 'INSTAGRAM') {
        logger.info(`[Competitors] Scraping Instagram profile: @${cleanUsername}`);
        const profile = await scrapeInstagramProfile(cleanUsername);

        if (profile) {
            scrapedData = {
                displayName: profile.displayName || username,
                followers: profile.followers,
                avatar: profile.avatarUrl,
                isVerified: profile.isVerified
            };
            logger.info(`[Competitors] Scraped @${cleanUsername}: ${profile.followers} followers`);
        } else {
            logger.warn(`[Competitors] Failed to scrape @${cleanUsername}, using defaults`);
        }
    }

    const competitor = await db.competitor.create({
        data: {
            organizationId,
            username: cleanUsername,
            platform: platformUpper,
            displayName: scrapedData.displayName,
            followers: scrapedData.followers,
            avatar: scrapedData.avatar,
            isVerified: scrapedData.isVerified,
            avgEngagement: 0,
            postsPerWeek: 0,
            lastSyncedAt: scrapedData.followers > 0 ? new Date() : null
        }
    });

    // Log activity
    await db.activity.create({
        data: {
            organizationId,
            userId,
            userName,
            action: 'added',
            resourceType: 'competitor',
            resourceId: competitor.id,
            resourceName: `@${competitor.username}`,
            details: `Platform: ${platform}${scrapedData.followers > 0 ? `, ${scrapedData.followers} followers` : ''}`
        }
    });

    return NextResponse.json({
        id: competitor.id,
        username: competitor.username,
        platform: competitor.platform.toLowerCase(),
        displayName: competitor.displayName,
        followers: competitor.followers,
        avatar: competitor.avatar,
        isVerified: competitor.isVerified,
        message: scrapedData.followers > 0
            ? 'Competitor added with live data.'
            : 'Competitor added. Data will sync shortly.'
    }, { status: 201 });
}

/**
 * DELETE /api/competitors - Remove competitor tracking
 */
export async function DELETE(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;
    const userId = session.user.id;
    const userName = session.user.name || 'Unknown';

    const { searchParams } = new URL(request.url);
    const competitorId = searchParams.get('id');

    if (!competitorId) {
        return NextResponse.json({ error: 'Competitor ID is required' }, { status: 400 });
    }

    // Verify competitor belongs to workspace
    const competitor = await db.competitor.findFirst({
        where: { id: competitorId, organizationId }
    });

    if (!competitor) {
        return NextResponse.json({ error: 'Competitor not found' }, { status: 404 });
    }

    await db.competitor.delete({ where: { id: competitorId } });

    // Log activity
    await db.activity.create({
        data: {
            organizationId,
            userId,
            userName,
            action: 'removed',
            resourceType: 'competitor',
            resourceId: competitorId,
            resourceName: `@${competitor.username}`
        }
    });

    return NextResponse.json({ success: true });
}
