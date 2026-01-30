/**
 * Platform Analytics API
 * Fetch detailed platform-specific analytics from database
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { syncAccountAnalytics } from '@/lib/platform-api/analytics-sync';

// GET /api/analytics/platform?accountId=...&days=30
export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.user.currentWorkspaceId;
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const days = parseInt(searchParams.get('days') || '30');

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    const whereClause: any = {
        workspaceId,
        date: { gte: startDate, lte: endDate }
    };

    if (accountId) {
        // Verify account belongs to workspace
        const account = await db.socialAccount.findFirst({
            where: { id: accountId, workspaceId }
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

// POST /api/analytics/platform/sync
export async function POST(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const { accountId } = body; // Optional, strict sync single account

    if (accountId) {
        const result = await syncAccountAnalytics(accountId);
        return NextResponse.json(result);
    } else {
        // Sync all
        // Note: Done in background usually, but here calling direct
        const { syncWorkspaceAnalytics } = await import('@/lib/platform-api/analytics-sync');
        const results = await syncWorkspaceAnalytics(session.user.currentWorkspaceId);
        return NextResponse.json({ results });
    }
}
