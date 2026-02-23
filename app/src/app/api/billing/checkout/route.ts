/**
 * Billing Checkout API
 *
 * Why: Creates a Stripe Checkout Session in subscription mode.
 * The org is linked to a Stripe customer (created or retrieved),
 * and the user is redirected to Stripe's hosted checkout page.
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
        const { priceId } = await request.json();

        if (!priceId || typeof priceId !== 'string') {
            return NextResponse.json(
                { error: 'priceId is required' },
                { status: 400 }
            );
        }

        const org = await db.organization.findUnique({
            where: { id: organizationId },
            select: {
                id: true,
                name: true,
                tier: true,
                stripeCustomerId: true,
            },
        });

        if (!org) {
            return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
        }

        // Why: ADMIN tier orgs should never go through Stripe checkout
        if (org.tier === 'ADMIN') {
            return NextResponse.json(
                { error: 'Admin tier organizations cannot be billed' },
                { status: 400 }
            );
        }

        // Create or retrieve Stripe customer
        let customerId = org.stripeCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({
                name: org.name,
                metadata: {
                    organizationId: org.id,
                },
            });
            customerId = customer.id;

            await db.organization.update({
                where: { id: org.id },
                data: { stripeCustomerId: customerId },
            });
        }

        const origin = request.headers.get('origin') || process.env.NEXTAUTH_URL || '';
        const trialDays = parseInt(process.env.STRIPE_TRIAL_DAYS || '0', 10);

        const checkoutSession = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: customerId,
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${origin}/settings?tab=billing&checkout=success`,
            cancel_url: `${origin}/settings?tab=billing&checkout=canceled`,
            allow_promotion_codes: true, // Why: Let users apply coupon codes at checkout
            ...(trialDays > 0 && {
                subscription_data: {
                    trial_period_days: trialDays,
                },
            }),
            metadata: {
                organizationId: org.id,
            },
        });

        return NextResponse.json({ url: checkoutSession.url });
    } catch (error) {
        logger.error({ error }, '[billing/checkout] Failed to create checkout session');
        return NextResponse.json(
            { error: 'Failed to create checkout session' },
            { status: 500 }
        );
    }
}
