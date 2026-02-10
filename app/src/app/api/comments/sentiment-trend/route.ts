/**
 * Sentiment Trend API
 * Returns daily sentiment counts for the past 7 days.
 * Used by the sentiment sparkline in the comments tab.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgId = session.user.currentOrganizationId;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Group comments by sentiment for the past 7 days
    const results = await db.comment.groupBy({
        by: ['sentiment', 'createdAt'],
        where: {
            organizationId: orgId,
            createdAt: { gte: sevenDaysAgo },
            sentiment: { not: null },
        },
        _count: true,
        orderBy: { createdAt: 'asc' },
    });

    // Bucket into daily bins
    const days: Record<string, { positive: number; neutral: number; negative: number }> = {};
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        days[key] = { positive: 0, neutral: 0, negative: 0 };
    }

    for (const row of results) {
        const key = new Date(row.createdAt).toISOString().slice(0, 10);
        const sentiment = (row.sentiment || 'neutral').toLowerCase() as 'positive' | 'neutral' | 'negative';
        if (days[key] && (sentiment === 'positive' || sentiment === 'neutral' || sentiment === 'negative')) {
            days[key][sentiment] += row._count;
        }
    }

    const data = Object.entries(days).map(([date, counts]) => ({ date, ...counts }));

    return NextResponse.json({ data });
}
