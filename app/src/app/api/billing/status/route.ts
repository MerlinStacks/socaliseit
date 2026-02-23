/**
 * Billing Status API
 *
 * Why: Returns the current org's billing status, plan limits,
 * and usage counters in a single call. Powers the billing
 * settings tab and the client-side `useBilling` hook.
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { getPlanLimits, PLAN_DISPLAY } from '@/lib/billing';
import { isStripeConfigured } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export async function GET() {
    const session = await getSession();
    const userId = session?.user?.id;
    const organizationId = session?.user?.currentOrganizationId;

    if (!userId || !organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const org = await db.organization.findUnique({
        where: { id: organizationId },
        select: {
            tier: true,
            stripeCustomerId: true,
            stripeSubscriptionId: true,
            subscriptionStatus: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
        },
    });

    if (!org) {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const tier = org.tier;
    const limits = getPlanLimits(tier);
    const display = PLAN_DISPLAY[tier as keyof typeof PLAN_DISPLAY] ?? PLAN_DISPLAY.FREE;

    // Gather usage counts
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [socialAccounts, teamMembers, scheduledPosts, aiGenerations, competitors] =
        await Promise.all([
            db.socialAccount.count({ where: { organizationId, isActive: true } }),
            db.organizationMember.count({ where: { organizationId } }),
            db.post.count({
                where: { organizationId, status: 'SCHEDULED', createdAt: { gte: startOfMonth } },
            }),
            db.post.count({
                where: { organizationId, isAiGenerated: true, createdAt: { gte: startOfMonth } },
            }),
            db.competitor.count({ where: { organizationId } }),
        ]);

    return NextResponse.json({
        tier,
        display,
        limits,
        usage: {
            socialAccounts,
            teamMembers,
            scheduledPostsPerMonth: scheduledPosts,
            aiGenerationsPerMonth: aiGenerations,
            competitorTracking: competitors,
        },
        subscription: {
            status: org.subscriptionStatus,
            currentPeriodEnd: org.currentPeriodEnd,
            cancelAtPeriodEnd: org.cancelAtPeriodEnd,
            hasStripeCustomer: !!org.stripeCustomerId,
            hasSubscription: !!org.stripeSubscriptionId,
        },
        stripeConfigured: isStripeConfigured(),
    });
}
