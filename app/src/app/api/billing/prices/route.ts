/**
 * Billing Prices API
 *
 * Why: Fetches real-time pricing from Stripe so the UI always
 * shows accurate dollar amounts even after price changes.
 * Caches for 10 minutes to avoid excessive Stripe API calls.
 */

import { NextResponse } from 'next/server';
import { stripe, isStripeConfigured } from '@/lib/stripe';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/** In-memory cache for Stripe prices */
let priceCache: { data: PriceInfo[]; cachedAt: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface PriceInfo {
    priceId: string;
    tier: string;
    amount: number; // In cents
    currency: string;
    interval: string; // "month" or "year"
    productName: string;
}

/** Maps price IDs to tier names (same logic as webhook) */
function getPriceMapping(): Record<string, string> {
    const mapping: Record<string, string> = {};

    const tiers = [
        { env: 'STRIPE_PRO_PRICE_ID', tier: 'PRO' },
        { env: 'STRIPE_BUSINESS_PRICE_ID', tier: 'BUSINESS' },
        { env: 'STRIPE_ENTERPRISE_PRICE_ID', tier: 'ENTERPRISE' },
    ];

    for (const { env, tier } of tiers) {
        const ids = (process.env[env] || '').split(',').map((s) => s.trim()).filter(Boolean);
        for (const id of ids) {
            mapping[id] = tier;
        }
    }

    return mapping;
}

export async function GET() {
    if (!isStripeConfigured()) {
        return NextResponse.json({ prices: [], configured: false });
    }

    // Return cached if fresh
    if (priceCache && Date.now() - priceCache.cachedAt < CACHE_TTL_MS) {
        return NextResponse.json({ prices: priceCache.data, configured: true });
    }

    try {
        const priceMapping = getPriceMapping();
        const priceIds = Object.keys(priceMapping);

        if (priceIds.length === 0) {
            return NextResponse.json({ prices: [], configured: true });
        }

        const prices: PriceInfo[] = [];

        // Why: Fetch each price individually rather than listing all.
        // This ensures we only return prices we recognize.
        for (const priceId of priceIds) {
            try {
                const stripePrice = await stripe.prices.retrieve(priceId, {
                    expand: ['product'],
                });

                const product = stripePrice.product;
                const productName = typeof product === 'string'
                    ? priceMapping[priceId]
                    : (product as { name?: string }).name || priceMapping[priceId];

                prices.push({
                    priceId,
                    tier: priceMapping[priceId],
                    amount: stripePrice.unit_amount || 0,
                    currency: stripePrice.currency,
                    interval: stripePrice.recurring?.interval || 'month',
                    productName,
                });
            } catch (err) {
                logger.warn({ priceId, err }, '[billing/prices] Failed to fetch price');
            }
        }

        // Cache the result
        priceCache = { data: prices, cachedAt: Date.now() };

        return NextResponse.json({ prices, configured: true });
    } catch (error) {
        logger.error({ error }, '[billing/prices] Failed to fetch prices');
        return NextResponse.json(
            { error: 'Failed to fetch prices' },
            { status: 500 }
        );
    }
}
