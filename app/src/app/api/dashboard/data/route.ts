/**
 * Dashboard Data API Route
 * Why: The SPA shell fetches this endpoint for client-side dashboard rendering.
 * Mirrors the data shape produced by dashboard-data.tsx (server component),
 * returning JSON instead of React nodes.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { startOfWeek, endOfWeek, addDays } from 'date-fns';

/** GET /api/dashboard/data */
export async function GET() {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;
    const userName = session.user.name || 'there';

    try {
        const now = new Date();
        const weekStart = startOfWeek(now, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
        const twoWeeksFromNow = addDays(now, 14);
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

        const [
            socialAccounts, posts, scheduledPosts, problemPosts,
            statusCounts, platformActivityRows, postsThisWeek, todoPosts,
            organization, publishedThisWeekCount, publishedLastWeekCount,
        ] = await Promise.all([
            db.socialAccount.findMany({
                where: { organizationId, isActive: true },
            }),
            db.post.findMany({
                where: { organizationId },
                orderBy: { createdAt: 'desc' },
                take: 10,
            }),
            db.post.findMany({
                where: {
                    organizationId,
                    status: 'SCHEDULED',
                    scheduledAt: { gte: now },
                },
                orderBy: { scheduledAt: 'asc' },
                take: 5,
                include: {
                    socialAccount: { select: { platform: true } },
                },
            }),
            db.post.findMany({
                where: {
                    organizationId,
                    OR: [
                        { status: 'FAILED' },
                        { status: 'SCHEDULED', scheduledAt: { lt: now } },
                        { status: 'PUBLISHING', scheduledAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } }
                    ]
                },
                orderBy: { createdAt: 'desc' },
                take: 5,
                include: { socialAccount: { select: { platform: true, name: true } } }
            }),
            db.post.groupBy({
                by: ['status'],
                where: { organizationId },
                _count: true,
            }),
            db.$queryRaw<Array<{
                socialAccountId: string;
                postType: string;
                lastPublished: Date | null;
                nextScheduled: Date | null;
            }>>`
                SELECT "socialAccountId", "postType",
                       MAX(CASE WHEN "status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL
                           THEN "publishedAt" END) as "lastPublished",
                       MIN(CASE WHEN "status" = 'SCHEDULED' AND "scheduledAt" > NOW()
                           THEN "scheduledAt" END) as "nextScheduled"
                FROM "Post"
                WHERE "organizationId" = ${organizationId}
                  AND "socialAccountId" IS NOT NULL
                GROUP BY "socialAccountId", "postType"
            `,
            db.post.groupBy({
                by: ['scheduledAt'],
                where: {
                    organizationId,
                    scheduledAt: { gte: weekStart, lte: weekEnd },
                },
                _count: true,
            }),
            db.post.findMany({
                where: {
                    organizationId,
                    OR: [
                        { status: 'DRAFT' },
                        { status: 'SCHEDULED', autoPublish: false, caption: '' },
                    ],
                },
                orderBy: { createdAt: 'desc' },
                take: 10,
                include: {
                    socialAccount: { select: { platform: true, name: true } },
                    pillar: { select: { name: true, color: true } },
                },
            }),
            // Why: SPA page needs showGettingStarted (org age) + analytics data
            db.organization.findUnique({
                where: { id: organizationId },
                select: { createdAt: true },
            }),
            db.post.count({
                where: { organizationId, status: 'PUBLISHED', publishedAt: { gte: sevenDaysAgo } },
            }),
            db.post.count({
                where: { organizationId, status: 'PUBLISHED', publishedAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
            }),
        ]);

        // Derive counts
        const totalPostCount = statusCounts.reduce((sum, row) => sum + row._count, 0);
        const publishedCount = statusCounts.find(r => r.status === 'PUBLISHED')?._count ?? 0;
        const draftCount = statusCounts.find(r => r.status === 'DRAFT')?._count ?? 0;

        // Build platform activity map
        const activityMap = new Map<string, {
            lastPostAt: Date | null; lastStoryAt: Date | null;
            nextPostAt: Date | null; nextStoryAt: Date | null;
        }>();

        for (const row of platformActivityRows) {
            const entry = activityMap.get(row.socialAccountId) ?? {
                lastPostAt: null, lastStoryAt: null, nextPostAt: null, nextStoryAt: null
            };
            if (row.postType === 'STORY') {
                if (row.lastPublished && (!entry.lastStoryAt || new Date(row.lastPublished) > entry.lastStoryAt)) {
                    entry.lastStoryAt = new Date(row.lastPublished);
                }
                if (row.nextScheduled && (!entry.nextStoryAt || new Date(row.nextScheduled) < entry.nextStoryAt)) {
                    entry.nextStoryAt = new Date(row.nextScheduled);
                }
            } else {
                if (row.lastPublished && (!entry.lastPostAt || new Date(row.lastPublished) > entry.lastPostAt)) {
                    entry.lastPostAt = new Date(row.lastPublished);
                }
                if (row.nextScheduled && (!entry.nextPostAt || new Date(row.nextScheduled) < entry.nextPostAt)) {
                    entry.nextPostAt = new Date(row.nextScheduled);
                }
            }
            activityMap.set(row.socialAccountId, entry);
        }

        const platformActivity = socialAccounts.map(
            (account: { id: string; platform: string; name: string }) => {
                const entry = activityMap.get(account.id);
                return {
                    platform: account.platform.toLowerCase(),
                    accountName: account.name,
                    lastPostAt: entry?.lastPostAt?.toISOString() ?? null,
                    lastStoryAt: entry?.lastStoryAt?.toISOString() ?? null,
                    nextPostAt: entry?.nextPostAt?.toISOString() ?? null,
                    nextStoryAt: entry?.nextStoryAt?.toISOString() ?? null,
                };
            }
        );

        const scheduledDates = postsThisWeek
            .filter((p: { scheduledAt: Date | null }) => p.scheduledAt)
            .flatMap((p: { scheduledAt: Date | null; _count: number }) =>
                Array(p._count).fill(p.scheduledAt!.toISOString())
            );

        const hasAccounts = socialAccounts.length > 0;
        const hasPosts = posts.length > 0;

        // Why: showGettingStarted uses org age — hide after 7 days
        const orgAgeDays = organization?.createdAt
            ? Math.floor((Date.now() - new Date(organization.createdAt).getTime()) / 86400000)
            : 999;
        const showGettingStarted = orgAgeDays < 7 && (!hasAccounts || !hasPosts);

        const stats = {
            connectedAccounts: socialAccounts.length,
            platformList: socialAccounts.map((a: { platform: string }) => a.platform.toLowerCase()),
            scheduledCount: scheduledPosts.length,
            totalPosts: totalPostCount,
            publishedCount,
            draftCount,
        };

        const publishedChange = publishedLastWeekCount === 0
            ? 0
            : Math.round(((publishedThisWeekCount - publishedLastWeekCount) / publishedLastWeekCount) * 100);

        const upcomingPosts = scheduledPosts.map((post: any) => ({
            id: post.id,
            caption: post.caption,
            scheduledAt: post.scheduledAt,
            platform: post.socialAccount?.platform?.toLowerCase() ?? null,
            thumbnailUrl: null,
        }));

        /* Shape todoPosts for the SPA client */
        const todoPostsShaped = todoPosts.map((post: any) => ({
            id: post.id,
            caption: post.caption,
            postType: post.postType,
            status: post.status.toLowerCase(),
            createdAt: post.createdAt,
            scheduledAt: post.scheduledAt,
            platform: post.socialAccount?.platform?.toLowerCase() ?? null,
            accountName: post.socialAccount?.name ?? null,
            pillarName: post.pillar?.name ?? null,
            pillarColor: post.pillar?.color ?? null,
        }));

        return NextResponse.json({
            userName,
            stats,
            upcomingPosts,
            scheduledDates,
            scheduledPosts,
            hasAccounts,
            hasPosts,
            showGettingStarted,
            platformActivity,
            problemPosts,
            todoPosts: todoPostsShaped,
            analytics: {
                publishedThisWeek: publishedThisWeekCount,
                publishedChange,
                totalPublished: publishedCount,
                totalScheduled: scheduledPosts.length,
            },
        }, {
            headers: {
                'Cache-Control': 'private, max-age=120, stale-while-revalidate=300',
            },
        });
    } catch (error) {
        logger.error({ error, organizationId }, 'Failed to fetch dashboard data');
        return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
    }
}
