/**
 * Stripe Webhook Handler
 *
 * Why: Stripe uses webhooks to notify us of subscription lifecycle events.
 * This is the single source of truth for tier changes — the checkout
 * success page does NOT update the tier; only this webhook does.
 *
 * Critical: Uses raw body (request.text()) for signature verification.
 * Next.js App Router does NOT auto-parse POST bodies as JSON here.
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getStripeInstance, getStripeConfig, isStripeConfigured } from '@/lib/stripe';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Maps Stripe Price IDs to our OrganizationTier enum using DB config.
 *
 * Why: Supports multiple price IDs per tier for grandfathering.
 * When you create a new price in Stripe (e.g. price increase),
 * existing subscribers keep their old price ID. Both old and new
 * IDs map to the same tier, so tier access is preserved.
 */
async function priceIdToTier(priceId: string): Promise<string> {
    const config = await getStripeConfig();

    const proPrices = (config.proPriceId || '').split(',').map((s) => s.trim()).filter(Boolean);
    const businessPrices = (config.businessPriceId || '').split(',').map((s) => s.trim()).filter(Boolean);
    const enterprisePrices = (config.enterprisePriceId || '').split(',').map((s) => s.trim()).filter(Boolean);

    if (proPrices.includes(priceId)) return 'PRO';
    if (businessPrices.includes(priceId)) return 'BUSINESS';
    if (enterprisePrices.includes(priceId)) return 'ENTERPRISE';
    return 'FREE';
}

/**
 * Checks if a webhook event has already been processed.
 * Why: Stripe may retry events on network failures. Without this,
 * a retried event could trigger duplicate tier changes or side effects.
 */
async function isEventProcessed(eventId: string): Promise<boolean> {
    const existing = await db.processedWebhookEvent.findUnique({
        where: { eventId },
    });
    return !!existing;
}

/** Marks an event as processed */
async function markEventProcessed(eventId: string): Promise<void> {
    await db.processedWebhookEvent.create({
        data: { eventId },
    }).catch(() => {
        // Why: Race condition on duplicate — if another instance already inserted, ignore
    });
}

export async function POST(request: NextRequest) {
    const config = await getStripeConfig();
    const configured = await isStripeConfigured();

    if (!configured || !config.webhookSecret) {
        return NextResponse.json(
            { error: 'Webhook is not configured' },
            { status: 503 }
        );
    }

    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
        return NextResponse.json(
            { error: 'Missing stripe-signature header' },
            { status: 400 }
        );
    }

    const stripe = await getStripeInstance();
    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(body, signature, config.webhookSecret);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        logger.error({ err }, '[webhook/stripe] Signature verification failed');
        return NextResponse.json(
            { error: `Webhook signature verification failed: ${message}` },
            { status: 400 }
        );
    }

    // Idempotency check
    if (await isEventProcessed(event.id)) {
        logger.info({ eventId: event.id }, '[webhook/stripe] Duplicate event — skipping');
        return NextResponse.json({ received: true, duplicate: true });
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed':
                await handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
                break;

            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
                break;

            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
                break;

            case 'invoice.payment_failed':
                await handlePaymentFailed(event.data.object as Stripe.Invoice);
                break;

            default:
                logger.info({ type: event.type }, '[webhook/stripe] Unhandled event type');
        }

        // Mark as processed only after successful handling
        await markEventProcessed(event.id);
    } catch (error) {
        // Why (BUG-12): Previously returned 200 on all handler errors, which told
        // Stripe the event was handled successfully. This silently lost tier changes.
        // Now returns 500 so Stripe retries. Idempotency guard above prevents
        // double-processing if the event was partially handled.
        logger.error({ error, eventType: event.type }, '[webhook/stripe] Handler failed');
        return NextResponse.json(
            { error: 'Handler failed, will retry' },
            { status: 500 }
        );
    }

    return NextResponse.json({ received: true });
}

/**
 * Handles successful checkout — assigns tier and stores Stripe IDs.
 *
 * Why: The checkout session metadata contains our organizationId,
 * which we set during session creation. We use this to find the org
 * and update it without relying on the customer ID lookup.
 */
async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
    const organizationId = session.metadata?.organizationId;
    if (!organizationId) {
        logger.warn('[webhook/stripe] checkout.session.completed missing organizationId metadata');
        return;
    }

    // Retrieve the full subscription to get the price ID
    const subscriptionId = typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;

    if (!subscriptionId) {
        logger.warn('[webhook/stripe] checkout.session.completed missing subscription');
        return;
    }

    const stripe = await getStripeInstance();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const priceId = subscription.items.data[0]?.price?.id || '';
    const tier = await priceIdToTier(priceId);

    await db.organization.update({
        where: { id: organizationId },
        data: {
            tier: tier as 'FREE' | 'PRO' | 'BUSINESS' | 'ENTERPRISE',
            stripeCustomerId: typeof session.customer === 'string'
                ? session.customer
                : session.customer?.id || null,
            stripeSubscriptionId: subscriptionId,
            stripePriceId: priceId,
            subscriptionStatus: subscription.status,
            // Why (BUG-08): Use subscription.current_period_end, not items.data[0].current_period_end.
            // The item-level field is deprecated in newer Stripe API versions and may return undefined.
            currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
        },
    });

    logger.info(
        { organizationId, tier, subscriptionId },
        '[webhook/stripe] Checkout completed — tier updated'
    );
}

/**
 * Handles subscription updates (plan changes, renewals, status changes).
 *
 * Why: This fires on upgrades, downgrades, and renewal billing.
 * We find the org by stripeCustomerId since metadata isn't on subscriptions.
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const customerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id;

    if (!customerId) return;

    const org = await db.organization.findUnique({
        where: { stripeCustomerId: customerId },
        select: { id: true, tier: true },
    });

    if (!org) {
        logger.warn({ customerId }, '[webhook/stripe] No org found for customer');
        return;
    }

    // Why: Never downgrade an ADMIN org via webhook
    if (org.tier === 'ADMIN') return;

    const priceId = subscription.items.data[0]?.price?.id || '';
    const tier = await priceIdToTier(priceId);

    await db.organization.update({
        where: { id: org.id },
        data: {
            tier: tier as 'FREE' | 'PRO' | 'BUSINESS' | 'ENTERPRISE',
            stripePriceId: priceId,
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: subscription.status,
            // Why (BUG-08): Use subscription.current_period_end, not items.data[0].current_period_end.
            currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
        },
    });

    logger.info({ orgId: org.id, tier, status: subscription.status }, '[webhook/stripe] Subscription updated');
}

/**
 * Handles subscription deletion — resets org to FREE tier.
 *
 * Why: This fires when a subscription is fully canceled (not just
 * cancel_at_period_end). We clear the subscription data but keep
 * the stripeCustomerId for future re-subscription.
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const customerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id;

    if (!customerId) return;

    const org = await db.organization.findUnique({
        where: { stripeCustomerId: customerId },
        select: { id: true, tier: true },
    });

    if (!org) return;

    // Why: Never downgrade an ADMIN org via webhook
    if (org.tier === 'ADMIN') return;

    await db.organization.update({
        where: { id: org.id },
        data: {
            tier: 'FREE',
            stripeSubscriptionId: null,
            stripePriceId: null,
            subscriptionStatus: 'canceled',
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
        },
    });

    logger.info({ orgId: org.id }, '[webhook/stripe] Subscription deleted — reset to FREE');
}

/**
 * Handles failed invoice payments.
 *
 * Why: Marks the subscription as past_due so the UI can show a warning
 * banner prompting the user to update their payment method.
 */
async function handlePaymentFailed(invoice: Stripe.Invoice) {
    const customerId = typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id;

    if (!customerId) return;

    await db.organization.updateMany({
        where: { stripeCustomerId: customerId },
        data: { subscriptionStatus: 'past_due' },
    });

    logger.warn({ customerId }, '[webhook/stripe] Invoice payment failed — marked past_due');
}
