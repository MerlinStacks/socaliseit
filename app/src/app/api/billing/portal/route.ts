/**
 * Billing Portal API
 *
 * Why: Creates a Stripe Customer Portal session so users can manage
 * payment methods, view invoices, and cancel subscriptions without
 * us building custom UI for those flows.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStripeInstance, isStripeConfigured } from '@/lib/stripe';
import { logger } from '@/lib/logger';
import { requireCurrentOrganizationAccess, requireOwnerOrAdmin } from '@/lib/auth/org-access';
import { checkRateLimit, createRateLimitHeaders, EXPENSIVE_RATE_LIMIT } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    if (!(await isStripeConfigured())) {
        return NextResponse.json(
            { error: 'Billing is not configured' },
            { status: 503 }
        );
    }

    const access = await requireCurrentOrganizationAccess();
    if (!access.ok) return access.response;
    const roleError = requireOwnerOrAdmin(access.ctx);
    if (roleError) return roleError;
    const { userId, organizationId } = access.ctx;

    const rateLimitResult = await checkRateLimit(`${userId}:billing-portal`, EXPENSIVE_RATE_LIMIT);
    if (!rateLimitResult.allowed) {
        return NextResponse.json({ error: 'Too many billing portal attempts. Please try again later.' }, { status: 429, headers: createRateLimitHeaders(rateLimitResult) });
    }

    try {
        const org = await db.organization.findUnique({
            where: { id: organizationId },
            select: { stripeCustomerId: true, tier: true },
        });

        if (!org?.stripeCustomerId) {
            return NextResponse.json(
                { error: 'No billing account found. Subscribe to a plan first.' },
                { status: 400 }
            );
        }

        if (org.tier === 'ADMIN') {
            return NextResponse.json(
                { error: 'Admin tier organizations do not have a billing portal' },
                { status: 400 }
            );
        }

        const origin = request.headers.get('origin') || process.env.NEXTAUTH_URL || '';
        const stripe = await getStripeInstance();

        const portalSession = await stripe.billingPortal.sessions.create({
            customer: org.stripeCustomerId,
            return_url: `${origin}/settings?tab=billing`,
        });

        return NextResponse.json({ url: portalSession.url });
    } catch (error) {
        logger.error({ error }, '[billing/portal] Failed to create portal session');
        return NextResponse.json(
            { error: 'Failed to create portal session' },
            { status: 500 }
        );
    }
}
