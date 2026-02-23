/**
 * Admin Platform Stats API
 * Platform-wide metrics for super admin dashboard
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';

/**
 * GET /api/admin/stats
 * Get platform-wide statistics
 */
export const GET = withSuperAdmin(async (request: NextRequest, admin: AdminContext) => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
        totalUsers,
        totalOrganizations,
        totalWorkspaces,
        totalPosts,
        totalSocialAccounts,
        usersLast30Days,
        postsLast7Days,
        organizationsByTier,
        postsByStatus,
    ] = await Promise.all([
        db.user.count(),
        db.organization.count(),
        db.organization.count(),
        db.post.count(),
        db.socialAccount.count(),
        db.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
        db.post.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
        db.organization.groupBy({
            by: ['tier'],
            _count: { id: true },
        }),
        db.post.groupBy({
            by: ['status'],
            _count: { id: true },
        }),
    ]);

    // Format tier breakdown
    const tierBreakdown = {
        FREE: 0,
        PRO: 0,
        BUSINESS: 0,
        ENTERPRISE: 0,
        ADMIN: 0,
    };
    organizationsByTier.forEach((item) => {
        tierBreakdown[item.tier] = item._count.id;
    });

    // Format post status breakdown
    const postStatusBreakdown: Record<string, number> = {};
    postsByStatus.forEach((item) => {
        postStatusBreakdown[item.status] = item._count.id;
    });

    return NextResponse.json({
        stats: {
            users: {
                total: totalUsers,
                last30Days: usersLast30Days,
            },
            organizations: {
                total: totalOrganizations,
                byTier: tierBreakdown,
            },
            workspaces: {
                total: totalWorkspaces,
            },
            posts: {
                total: totalPosts,
                last7Days: postsLast7Days,
                byStatus: postStatusBreakdown,
            },
            socialAccounts: {
                total: totalSocialAccounts,
            },
        },
        generatedAt: now.toISOString(),
    });
});
