/**
 * Competitors API Route
 * CRUD operations for competitor tracking
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * GET /api/competitors - List tracked competitors
 */
export async function GET() {
    const session = await auth();

    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.user.currentWorkspaceId;

    const competitors = await db.competitor.findMany({
        where: { workspaceId },
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
 */
export async function POST(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.user.currentWorkspaceId;
    const userId = session.user.id;
    const userName = session.user.name || 'Unknown';

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

    // Check for duplicate
    const existing = await db.competitor.findUnique({
        where: {
            workspaceId_platform_username: {
                workspaceId,
                platform: platformUpper,
                username: username.toLowerCase().replace('@', '')
            }
        }
    });

    if (existing) {
        return NextResponse.json({ error: 'Already tracking this competitor' }, { status: 400 });
    }

    const competitor = await db.competitor.create({
        data: {
            workspaceId,
            username: username.toLowerCase().replace('@', ''),
            platform: platformUpper,
            // In a real implementation, we'd fetch real data from social APIs
            // For now, create with placeholder data
            displayName: username,
            followers: 0,
            avgEngagement: 0,
            postsPerWeek: 0
        }
    });

    // Log activity
    await db.activity.create({
        data: {
            workspaceId,
            userId,
            userName,
            action: 'added',
            resourceType: 'competitor',
            resourceId: competitor.id,
            resourceName: `@${competitor.username}`,
            details: `Platform: ${platform}`
        }
    });

    return NextResponse.json({
        id: competitor.id,
        username: competitor.username,
        platform: competitor.platform.toLowerCase(),
        displayName: competitor.displayName,
        followers: competitor.followers,
        message: 'Competitor added. Data will sync once social accounts are connected.'
    }, { status: 201 });
}

/**
 * DELETE /api/competitors - Remove competitor tracking
 */
export async function DELETE(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.user.currentWorkspaceId;
    const userId = session.user.id;
    const userName = session.user.name || 'Unknown';

    const { searchParams } = new URL(request.url);
    const competitorId = searchParams.get('id');

    if (!competitorId) {
        return NextResponse.json({ error: 'Competitor ID is required' }, { status: 400 });
    }

    // Verify competitor belongs to workspace
    const competitor = await db.competitor.findFirst({
        where: { id: competitorId, workspaceId }
    });

    if (!competitor) {
        return NextResponse.json({ error: 'Competitor not found' }, { status: 404 });
    }

    await db.competitor.delete({ where: { id: competitorId } });

    // Log activity
    await db.activity.create({
        data: {
            workspaceId,
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
