/**
 * Admin Billing Stats API
 *
 * Why: Provides billing-specific metrics for the admin dashboard
 * and the dedicated billing management page — paid org counts,
 * MRR estimate, tier distribution, and subscription status breakdown.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';

export const GET = withSuperAdmin(async (_req: NextRequest, _admin: AdminContext) => {
    const organizations = await db.organization.findMany({
        select: {
            tier: true,
            subscriptionStatus: true,
            stripeSubscriptionId: true,
            stripePriceId: true,
            cancelAtPeriodEnd: true,
        },
    });

    // Tier distribution
    const tierDistribution: Record<string, number> = {
        FREE: 0, PRO: 0, BUSINESS: 0, ENTERPRISE: 0, ADMIN: 0,
    };
    for (const org of organizations) {
        const tier = org.tier || 'FREE';
        tierDistribution[tier] = (tierDistribution[tier] || 0) + 1;
    }

    // Subscription status breakdown
    const statusBreakdown: Record<string, number> = {};
    const paidOrgs = organizations.filter((o) => o.stripeSubscriptionId);
    for (const org of paidOrgs) {
        const status = org.subscriptionStatus || 'unknown';
        statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
    }

    // Cancelling count (active but set to cancel)
    const cancellingCount = paidOrgs.filter(
        (o) => o.subscriptionStatus === 'active' && o.cancelAtPeriodEnd
    ).length;

    // Banned users count
    const bannedUserCount = await db.user.count({
        where: { bannedAt: { not: null } },
    });

    return NextResponse.json({
        totalOrganizations: organizations.length,
        paidOrganizations: paidOrgs.length,
        freeOrganizations: tierDistribution.FREE,
        tierDistribution,
        statusBreakdown,
        cancellingCount,
        bannedUserCount,
    });
});
