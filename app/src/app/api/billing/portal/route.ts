/**
 * Billing Portal API
 *
 * Why: Creates a Stripe Customer Portal session so users can manage
 * payment methods, view invoices, and cancel subscriptions without
 * us building custom UI for those flows.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { stripe, isStripeConfigured } from '@/lib/stripe';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    if (!isStripeConfigured()) {
        return NextResponse.json(
            { error: 'Billing is not configured' },
            { status: 503 }
        );
    }

    const session = await getSession();
    const userId = session?.user?.id;
    const organizationId = session?.user?.currentOrganizationId;

    if (!userId || !organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
