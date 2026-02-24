/**
 * Billing Prices API
 *
 * Why: Fetches real-time pricing from Stripe so the UI always
 * shows accurate dollar amounts even after price changes.
 * Caches for 10 minutes to avoid excessive Stripe API calls.
 * Also returns price IDs so the client can resolve them at runtime
 * instead of relying on NEXT_PUBLIC_ build-time env vars.
 */

import { NextResponse } from 'next/server';
import { getStripeInstance, getStripeConfig, isStripeConfigured } from '@/lib/stripe';
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

/**
 * Maps price IDs to tier names using DB config with env-var fallback.
 * Why: Decoupled from process.env so admin-configured price IDs are used.
 */
async function getPriceMapping(): Promise<Record<string, string>> {
    const config = await getStripeConfig();
    const mapping: Record<string, string> = {};

    const tiers = [
        { ids: config.proPriceId, tier: 'PRO' },
        { ids: config.businessPriceId, tier: 'BUSINESS' },
        { ids: config.enterprisePriceId, tier: 'ENTERPRISE' },
    ];

    for (const { ids, tier } of tiers) {
        const priceIds = (ids || '').split(',').map((s) => s.trim()).filter(Boolean);
        for (const id of priceIds) {
            mapping[id] = tier;
        }
    }

    return mapping;
}

export async function GET() {
    if (!(await isStripeConfigured())) {
        return NextResponse.json({ prices: [], configured: false, priceIds: {} });
    }

    // Return cached if fresh
    if (priceCache && Date.now() - priceCache.cachedAt < CACHE_TTL_MS) {
        const config = await getStripeConfig();
        return NextResponse.json({
            prices: priceCache.data,
            configured: true,
            priceIds: {
                PRO: config.proPriceId || '',
                BUSINESS: config.businessPriceId || '',
                ENTERPRISE: config.enterprisePriceId || '',
            },
        });
    }

    try {
        const priceMapping = await getPriceMapping();
        const priceIds = Object.keys(priceMapping);

        if (priceIds.length === 0) {
            return NextResponse.json({ prices: [], configured: true, priceIds: {} });
        }

        const stripe = await getStripeInstance();
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

        const config = await getStripeConfig();
        return NextResponse.json({
            prices,
            configured: true,
            priceIds: {
                PRO: config.proPriceId || '',
                BUSINESS: config.businessPriceId || '',
                ENTERPRISE: config.enterprisePriceId || '',
            },
        });
    } catch (error) {
        logger.error({ error }, '[billing/prices] Failed to fetch prices');
        return NextResponse.json(
            { error: 'Failed to fetch prices' },
            { status: 500 }
        );
    }
}
