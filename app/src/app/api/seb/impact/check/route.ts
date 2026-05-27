import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST() {
    const session = await auth();
    const organizationId = session?.user?.currentOrganizationId;
    if (!session?.user?.id || !organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const doneRecommendations = await db.sebRecommendation.findMany({
        where: { organizationId, status: 'DONE' },
        orderBy: { completedAt: 'desc' },
        take: 30,
    });

    const updated = [];
    for (const recommendation of doneRecommendations) {
        const completedAt = recommendation.completedAt || recommendation.updatedAt;
        const beforeStart = new Date(completedAt.getTime() - 30 * 24 * 60 * 60 * 1000);
        const afterEnd = new Date(completedAt.getTime() + 30 * 24 * 60 * 60 * 1000);

        const [before, after] = await Promise.all([
            db.postAnalytics.aggregate({
                where: { post: { organizationId, publishedAt: { gte: beforeStart, lt: completedAt } } },
                _avg: { engagementRate: true },
                _sum: { impressions: true, reach: true, likes: true, comments: true, shares: true, saves: true, videoViews: true },
            }),
            db.postAnalytics.aggregate({
                where: { post: { organizationId, publishedAt: { gte: completedAt, lte: afterEnd } } },
                _avg: { engagementRate: true },
                _sum: { impressions: true, reach: true, likes: true, comments: true, shares: true, saves: true, videoViews: true },
            }),
        ]);

        const result = {
            checkedAt: new Date().toISOString(),
            window: '30 days before vs 30 days after completion',
            before,
            after,
            engagementRateChange: (after._avg.engagementRate ?? 0) - (before._avg.engagementRate ?? 0),
        };

        updated.push(await db.sebRecommendation.update({
            where: { id: recommendation.id },
            data: { impactResult: result, impactCheckedAt: new Date() },
        }));
    }

    return NextResponse.json({ updated });
}
