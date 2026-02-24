/**
 * Public Plans API
 *
 * Why: Serves plan configuration to the landing page and billing UI.
 * Returns only customer-facing tiers (no ADMIN). Cached in-memory
 * for 5 minutes to avoid DB hits on every page load.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { PLAN_LIMITS, PLAN_DISPLAY } from '@/lib/billing/plan-config';

export const dynamic = 'force-dynamic';

interface PublicPlan {
    tier: string;
    displayName: string;
    description: string;
    color: string;
    pricingLabel: string;
    pricingPeriod: string;
    popular: boolean;
    ctaText: string;
    featureBullets: string[];
}

/** In-memory cache */
let planCache: { data: PublicPlan[]; cachedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Hardcoded fallback if DB has no rows */
const FALLBACK_PLANS: PublicPlan[] = [
    {
        tier: 'FREE', displayName: 'Free', description: 'Get started with the basics',
        color: '#6B7280', pricingLabel: '$0', pricingPeriod: '/mo', popular: false,
        ctaText: 'Get Started', featureBullets: [
            '3 social accounts', '2 team members', '30 scheduled posts/month',
            '10 AI generations/month', 'Content calendar', 'Basic analytics',
        ],
    },
    {
        tier: 'PRO', displayName: 'Pro', description: 'For growing brands',
        color: '#8B5CF6', pricingLabel: '$29', pricingPeriod: '/mo', popular: true,
        ctaText: 'Start Free Trial', featureBullets: [
            '10 social accounts', '5 team members', '150 scheduled posts/month',
            '100 AI generations/month', 'Analytics export (PDF/CSV)', '3 competitor tracking slots',
        ],
    },
    {
        tier: 'BUSINESS', displayName: 'Business', description: 'For teams & agencies',
        color: '#D4A574', pricingLabel: '$79', pricingPeriod: '/mo', popular: false,
        ctaText: 'Start Free Trial', featureBullets: [
            '25 social accounts', '15 team members', '500 scheduled posts/month',
            '500 AI generations/month', 'Custom branding', '10 competitor tracking slots',
        ],
    },
    {
        tier: 'ENTERPRISE', displayName: 'Enterprise', description: 'Unlimited everything',
        color: '#F59E0B', pricingLabel: 'Custom', pricingPeriod: '', popular: false,
        ctaText: 'Contact Us', featureBullets: [
            'Unlimited social accounts', 'Unlimited team members', 'Unlimited scheduled posts',
            'Unlimited AI generations', 'Priority support', 'Dedicated account manager',
        ],
    },
];

const TIER_ORDER = ['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE'];

/**
 * GET /api/plans
 * Returns public plan data for the pricing section.
 */
export async function GET() {
    // Return cached if fresh
    if (planCache && Date.now() - planCache.cachedAt < CACHE_TTL_MS) {
        return NextResponse.json({ plans: planCache.data });
    }

    try {
        const rows = await db.planConfig.findMany({
            where: { tier: { in: TIER_ORDER } },
        });

        if (rows.length === 0) {
            planCache = { data: FALLBACK_PLANS, cachedAt: Date.now() };
            return NextResponse.json({ plans: FALLBACK_PLANS });
        }

        const plans: PublicPlan[] = rows
            .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier))
            .map((r) => ({
                tier: r.tier,
                displayName: r.displayName,
                description: r.description,
                color: r.color,
                pricingLabel: r.pricingLabel,
                pricingPeriod: r.pricingPeriod,
                popular: r.popular,
                ctaText: r.ctaText,
                featureBullets: r.featureBullets,
            }));

        planCache = { data: plans, cachedAt: Date.now() };
        return NextResponse.json({ plans });
    } catch {
        // Why: Graceful degradation — if DB is down, use hardcoded fallback
        return NextResponse.json({ plans: FALLBACK_PLANS });
    }
}
