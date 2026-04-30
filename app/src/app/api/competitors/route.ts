/**
 * Competitors API Route
 * CRUD operations for competitor tracking with rate limiting.
 *
 * Why: Uses the Instagram Business Discovery API (via the org's connected
 * IG Business account) instead of the old HTML scraper that Instagram
 * was blocking.
 */

import { NextRequest, NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/utils';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getBusinessDiscoveryProfile } from '@/lib/platform-api/instagram/business-discovery';
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
        orderBy: { followers: 'desc' },
        include: {
            posts: {
                orderBy: { postedAt: 'desc' },
                take: 6,
                select: {
                    id: true,
                    caption: true,
                    mediaType: true,
                    likes: true,
                    comments: true,
                    engagement: true,
                    postedAt: true,
                }
            },
            _count: { select: { posts: true } }
        }
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
        lastSynced: comp.lastSyncedAt?.toISOString() || null,
        createdAt: comp.createdAt.toISOString(),
        engagementHistory: comp.engagementHistory || [],
        shareOfVoice: comp.shareOfVoice,
        benchmarkScore: comp.benchmarkScore,
        postCount: comp._count.posts,
        recentPosts: comp.posts.map(p => ({
            id: p.id,
            caption: p.caption,
            mediaType: p.mediaType,
            likes: p.likes,
            comments: p.comments,
            engagement: p.engagement,
            postedAt: p.postedAt.toISOString(),
        })),
    }));

    return NextResponse.json({
        competitors: formattedCompetitors,
        total: competitors.length
    });
}

/**
 * POST /api/competitors - Add a competitor to track
 * Rate limited to prevent abuse. Uses Business Discovery API for
 * Instagram competitors when the org has a connected IG account.
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

    const parseResult = await safeParseJson(request);
    if (!parseResult.ok) {
        return NextResponse.json({ error: parseResult.error }, { status: 400 });
    }
    const body = parseResult.data;
    const username = String(body.username ?? '');
    const platform = String(body.platform ?? '');

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
                platform: platformUpper as unknown as 'INSTAGRAM',
                username: cleanUsername
            }
        }
    });

    if (existing) {
        return NextResponse.json({ error: 'Already tracking this competitor' }, { status: 400 });
    }

    // Fetch profile via Business Discovery (Instagram only)
    let profileData = {
        displayName: username,
        followers: 0,
        avatar: null as string | null,
        isVerified: false,
    };
    let apiWarning: string | undefined;

    if (platformUpper === 'INSTAGRAM') {
        const result = await fetchViaBusinessDiscovery(organizationId, cleanUsername);
        if (result.success && result.data) {
            profileData = {
                displayName: result.data.displayName || username,
                followers: result.data.followers,
                avatar: result.data.avatarUrl,
                isVerified: result.data.isVerified,
            };
        } else {
            // Why: Still create the competitor even if lookup fails — the user
            // can retry via the Sync button later.
            apiWarning = result.error;
            logger.warn({ username: cleanUsername, error: result.error }, 'Business Discovery lookup failed on add');
        }
    }

    const competitor = await db.competitor.create({
        data: {
            organizationId,
            username: cleanUsername,
            platform: platformUpper as unknown as 'INSTAGRAM',
            displayName: profileData.displayName,
            followers: profileData.followers,
            avatar: profileData.avatar,
            isVerified: profileData.isVerified,
            avgEngagement: 0,
            postsPerWeek: 0,
            lastSyncedAt: profileData.followers > 0 ? new Date() : null
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
            details: `Platform: ${platform}${profileData.followers > 0 ? `, ${profileData.followers} followers` : ''}`
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
        warning: apiWarning,
        message: profileData.followers > 0
            ? 'Competitor added with live data.'
            : 'Competitor added. Click sync to fetch data.'
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

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Look up an Instagram competitor via Business Discovery API
 * using the org's connected Instagram Business account.
 *
 * Why: We need a connected IG Business account to call the API.
 * Finds the first active IG account in the org and uses its token.
 */
async function fetchViaBusinessDiscovery(
    organizationId: string,
    targetUsername: string
): Promise<{ success: boolean; data?: { displayName: string; followers: number; avatarUrl: string | null; isVerified: boolean }; error?: string }> {
    // Find an active Instagram account in the org
    const igAccount = await db.socialAccount.findFirst({
        where: { organizationId, platform: 'INSTAGRAM', isActive: true },
        select: { id: true, platformId: true },
    });

    if (!igAccount) {
        return { success: false, error: 'No connected Instagram Business account. Connect one in Settings to enable competitor lookup.' };
    }

    // Get a valid token
    const { ensureValidToken } = await import('@/lib/services/token-service');
    const tokenResult = await ensureValidToken(igAccount.id);
    if (!tokenResult.success || !tokenResult.accessToken) {
        return { success: false, error: 'Instagram token expired. Please reconnect your account in Settings.' };
    }

    const result = await getBusinessDiscoveryProfile(
        tokenResult.accessToken,
        igAccount.platformId,
        targetUsername
    );

    if (!result.success || !result.data) {
        return { success: false, error: result.error || 'Failed to look up competitor.' };
    }

    return {
        success: true,
        data: {
            displayName: result.data.displayName,
            followers: result.data.followers,
            avatarUrl: result.data.avatarUrl,
            isVerified: result.data.isVerified,
        },
    };
}
