/**
 * Platform Analytics API
 * Fetch detailed platform-specific analytics from database
 */

import { NextRequest, NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/utils';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { syncSingleAccountAnalytics, syncPlatformAnalytics } from '@/lib/services/platform-analytics-sync';

/**
 * GET /api/analytics/platform?accountId=...&days=30
 */
export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const organizationId = session.user.currentOrganizationId;
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const days = parseInt(searchParams.get('days') || '30', 10);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    const whereClause: Record<string, unknown> = {
        organizationId,
        date: { gte: startDate, lte: endDate }
    };

    if (accountId) {
        // Verify account belongs to workspace
        const account = await db.socialAccount.findFirst({
            where: { id: accountId, organizationId }
        });
        if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        whereClause.socialAccountId = accountId;
    }

    const metrics = await db.platformAnalytics.findMany({
        where: whereClause,
        orderBy: { date: 'asc' },
        include: { socialAccount: { select: { name: true, platform: true, avatar: true } } }
    });

    return NextResponse.json(metrics);
}

/**
 * POST /api/analytics/platform
 * Sync analytics for a single account or all accounts
 */
export async function POST(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const parseResult = await safeParseJson(request);
    if (!parseResult.ok) {
        return NextResponse.json({ error: parseResult.error }, { status: 400 });
    }
    const body = parseResult.data;
    const { accountId } = body as Record<string, unknown>;

    if (accountId && typeof accountId === 'string') {
        const result = await syncSingleAccountAnalytics(accountId);
        return NextResponse.json(result);
    } else {
        const results = await syncPlatformAnalytics(session.user.currentOrganizationId);
        return NextResponse.json({ results });
    }
}
