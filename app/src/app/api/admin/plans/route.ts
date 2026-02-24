/**
 * Admin Plans API
 *
 * Why: Lets super admins read and update plan tier configurations
 * (limits, display metadata, pricing labels). Changes are reflected
 * on the public landing page and billing UI.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';
import { recordAuditLog, AUDIT_ACTIONS } from '@/lib/admin/audit';
import { PLAN_LIMITS, PLAN_DISPLAY } from '@/lib/billing/plan-config';
import { invalidatePlanCache } from '@/lib/billing/plan-cache';

/** Tiers that can be configured (ADMIN tier is internal-only) */
const CONFIGURABLE_TIERS = ['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE'] as const;

/** Default feature bullets per tier (used when seeding) */
const DEFAULT_BULLETS: Record<string, string[]> = {
    FREE: [
        '3 social accounts', '2 team members', '30 scheduled posts/month',
        '10 AI generations/month', 'Content calendar', 'Basic analytics',
    ],
    PRO: [
        '10 social accounts', '5 team members', '150 scheduled posts/month',
        '100 AI generations/month', 'Analytics export (PDF/CSV)', '3 competitor tracking slots',
    ],
    BUSINESS: [
        '25 social accounts', '15 team members', '500 scheduled posts/month',
        '500 AI generations/month', 'Custom branding', '10 competitor tracking slots',
    ],
    ENTERPRISE: [
        'Unlimited social accounts', 'Unlimited team members', 'Unlimited scheduled posts',
        'Unlimited AI generations', 'Priority support', 'Dedicated account manager',
    ],
};

const DEFAULT_PRICING: Record<string, { label: string; period: string; monthly: number; popular: boolean; cta: string }> = {
    FREE: { label: '$0', period: '/mo', monthly: 0, popular: false, cta: 'Get Started' },
    PRO: { label: '$29', period: '/mo', monthly: 2900, popular: true, cta: 'Start Free Trial' },
    BUSINESS: { label: '$79', period: '/mo', monthly: 7900, popular: false, cta: 'Start Free Trial' },
    ENTERPRISE: { label: 'Custom', period: '', monthly: 0, popular: false, cta: 'Contact Us' },
};

/**
 * GET /api/admin/plans
 * Returns all plan configs. Seeds from hardcoded defaults if no rows exist.
 */
export const GET = withSuperAdmin(async (_request: NextRequest, _admin: AdminContext) => {
    let plans = await db.planConfig.findMany({
        orderBy: { tier: 'asc' },
    });

    // Why: First-run seeding — populate DB from hardcoded defaults
    if (plans.length === 0) {
        const seedData = CONFIGURABLE_TIERS.map((tier) => {
            const limits = PLAN_LIMITS[tier];
            const display = PLAN_DISPLAY[tier];
            const pricing = DEFAULT_PRICING[tier];

            return {
                tier,
                displayName: display.name,
                description: display.description,
                color: display.color,
                priceMonthly: pricing.monthly,
                pricingLabel: pricing.label,
                pricingPeriod: pricing.period,
                popular: pricing.popular,
                ctaText: pricing.cta,
                socialAccounts: isFinite(limits.socialAccounts) ? limits.socialAccounts : -1,
                teamMembers: isFinite(limits.teamMembers) ? limits.teamMembers : -1,
                scheduledPostsPerMonth: isFinite(limits.scheduledPostsPerMonth) ? limits.scheduledPostsPerMonth : -1,
                aiGenerationsPerMonth: isFinite(limits.aiGenerationsPerMonth) ? limits.aiGenerationsPerMonth : -1,
                competitorTracking: isFinite(limits.competitorTracking) ? limits.competitorTracking : -1,
                videoEditor: limits.videoEditor,
                analyticsExport: limits.analyticsExport,
                customBranding: limits.customBranding,
                prioritySupport: limits.prioritySupport,
                featureBullets: DEFAULT_BULLETS[tier] || [],
            };
        });

        for (const data of seedData) {
            await db.planConfig.create({ data });
        }

        plans = await db.planConfig.findMany({ orderBy: { tier: 'asc' } });
    }

    return NextResponse.json({ plans });
});

const UpdatePlanSchema = z.object({
    tier: z.enum(['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE']),
    displayName: z.string().min(1).max(50).optional(),
    description: z.string().max(200).optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    priceMonthly: z.number().min(0).optional(),
    pricingLabel: z.string().max(20).optional(),
    pricingPeriod: z.string().max(10).optional(),
    popular: z.boolean().optional(),
    ctaText: z.string().max(30).optional(),
    socialAccounts: z.number().min(-1).optional(),
    teamMembers: z.number().min(-1).optional(),
    scheduledPostsPerMonth: z.number().min(-1).optional(),
    aiGenerationsPerMonth: z.number().min(-1).optional(),
    competitorTracking: z.number().min(-1).optional(),
    videoEditor: z.boolean().optional(),
    analyticsExport: z.boolean().optional(),
    customBranding: z.boolean().optional(),
    prioritySupport: z.boolean().optional(),
    featureBullets: z.array(z.string().max(100)).max(10).optional(),
});

/**
 * PATCH /api/admin/plans
 * Update a single plan's configuration.
 */
export const PATCH = withSuperAdmin(async (request: NextRequest, admin: AdminContext) => {
    const body = await request.json();
    const parsed = UpdatePlanSchema.safeParse(body);

    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation Error', details: parsed.error.flatten() },
            { status: 400 }
        );
    }

    const { tier, ...updates } = parsed.data;

    const plan = await db.planConfig.upsert({
        where: { tier },
        create: { tier, ...updates },
        update: updates,
    });

    // Why: Bust the server-side cache so feature gates pick up new limits immediately
    invalidatePlanCache();

    await recordAuditLog({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        actorId: admin.userId,
        targetType: 'settings',
        targetId: tier,
        metadata: { changes: updates },
        request,
    });

    return NextResponse.json({ plan });
});
