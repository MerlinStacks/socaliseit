/**
 * Plan Configuration
 *
 * Why: Single source of truth for what each tier can do.
 * ADMIN and ENTERPRISE use Infinity for all numerical limits,
 * ensuring Super Admin orgs are never gated.
 */

/** All feature keys that can be gated by tier */
export type GatedFeature =
    | 'socialAccounts'
    | 'teamMembers'
    | 'scheduledPostsPerMonth'
    | 'aiGenerationsPerMonth'
    | 'competitorTracking'
    | 'analyticsExport'
    | 'customBranding'
    | 'prioritySupport';

export interface PlanLimits {
    /** Max connected social accounts */
    socialAccounts: number;
    /** Max team members in the organization */
    teamMembers: number;
    /** Max scheduled posts per calendar month */
    scheduledPostsPerMonth: number;
    /** Max AI content generations per calendar month */
    aiGenerationsPerMonth: number;
    /** Max competitors to track (0 = disabled) */
    competitorTracking: number;
    /** PDF/CSV analytics export */
    analyticsExport: boolean;
    /** White-label / custom branding */
    customBranding: boolean;
    /** Priority support channel */
    prioritySupport: boolean;
}

type TierKey = 'FREE' | 'PRO' | 'BUSINESS' | 'ENTERPRISE' | 'ADMIN';

/**
 * Plan limits by tier.
 * Why: Centralizes all business rules so feature gates and the
 * billing UI both derive from the same source.
 */
export const PLAN_LIMITS: Record<TierKey, PlanLimits> = {
    FREE: {
        socialAccounts: 3,
        teamMembers: 2,
        scheduledPostsPerMonth: 30,
        aiGenerationsPerMonth: 10,
        competitorTracking: 0,
        analyticsExport: false,
        customBranding: false,
        prioritySupport: false,
    },
    PRO: {
        socialAccounts: 10,
        teamMembers: 5,
        scheduledPostsPerMonth: 150,
        aiGenerationsPerMonth: 100,
        competitorTracking: 3,
        analyticsExport: true,
        customBranding: false,
        prioritySupport: false,
    },
    BUSINESS: {
        socialAccounts: 25,
        teamMembers: 15,
        scheduledPostsPerMonth: 500,
        aiGenerationsPerMonth: 500,
        competitorTracking: 10,
        analyticsExport: true,
        customBranding: true,
        prioritySupport: false,
    },
    ENTERPRISE: {
        socialAccounts: Infinity,
        teamMembers: Infinity,
        scheduledPostsPerMonth: Infinity,
        aiGenerationsPerMonth: Infinity,
        competitorTracking: Infinity,
        analyticsExport: true,
        customBranding: true,
        prioritySupport: true,
    },
    ADMIN: {
        socialAccounts: Infinity,
        teamMembers: Infinity,
        scheduledPostsPerMonth: Infinity,
        aiGenerationsPerMonth: Infinity,
        competitorTracking: Infinity,
        analyticsExport: true,
        customBranding: true,
        prioritySupport: true,
    },
};

/** Display metadata for each plan (used in billing UI) */
export const PLAN_DISPLAY: Record<TierKey, { name: string; description: string; color: string }> = {
    FREE: { name: 'Free', description: 'Get started with the basics', color: '#6B7280' },
    PRO: { name: 'Pro', description: 'For growing brands', color: '#8B5CF6' },
    BUSINESS: { name: 'Business', description: 'For teams & agencies', color: '#D4A574' },
    ENTERPRISE: { name: 'Enterprise', description: 'Unlimited everything', color: '#F59E0B' },
    ADMIN: { name: 'Admin', description: 'Internal — unlimited', color: '#EF4444' },
};

/**
 * Returns plan limits for a given tier.
 * Why: Type-safe accessor that falls back to FREE if an unknown tier is passed.
 */
export function getPlanLimits(tier: string): PlanLimits {
    return PLAN_LIMITS[tier as TierKey] ?? PLAN_LIMITS.FREE;
}

/**
 * Checks whether a boolean feature is enabled for a tier.
 * Why: Convenience wrapper — avoids consumers needing to know the shape of PlanLimits.
 */
export function isFeatureEnabled(tier: string, feature: keyof PlanLimits): boolean {
    const limits = getPlanLimits(tier);
    const value = limits[feature];
    if (typeof value === 'boolean') return value;
    // Numerical limits: enabled if > 0
    return (value as number) > 0;
}

/**
 * Returns the numerical limit for a countable feature.
 * Why: Used by feature-gate to compare current usage against the cap.
 */
export function getFeatureLimit(tier: string, feature: keyof PlanLimits): number {
    const limits = getPlanLimits(tier);
    const value = limits[feature];
    if (typeof value === 'number') return value;
    // Boolean features: 1 if enabled, 0 if disabled
    return value ? 1 : 0;
}
