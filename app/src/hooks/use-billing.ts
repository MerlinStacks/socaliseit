/**
 * Billing React Query hook
 *
 * Why: Provides tier, limits, usage, and subscription status
 * to any component via a single React Query cache entry.
 * Includes convenience helpers like `canUse()` and `isAdmin`.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import type { PlanLimits, GatedFeature } from '@/lib/billing/plan-config';

interface BillingUsage {
    socialAccounts: number;
    teamMembers: number;
    scheduledPostsPerMonth: number;
    aiGenerationsPerMonth: number;
    competitorTracking: number;
}

interface SubscriptionInfo {
    status: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    hasStripeCustomer: boolean;
    hasSubscription: boolean;
}

interface PlanDisplay {
    name: string;
    description: string;
    color: string;
}

interface BillingStatusResponse {
    tier: string;
    display: PlanDisplay;
    limits: PlanLimits;
    usage: BillingUsage;
    subscription: SubscriptionInfo;
    stripeConfigured: boolean;
}

/**
 * Fetches and caches the current org's billing status.
 * Why: 5-minute stale time avoids hammering the status API on every navigation.
 */
export function useBilling() {
    const query = useQuery<BillingStatusResponse>({
        queryKey: ['billing-status'],
        queryFn: async () => {
            const res = await fetch('/api/billing/status');
            if (!res.ok) throw new Error('Failed to fetch billing status');
            return res.json();
        },
        staleTime: 5 * 60 * 1000,
        retry: 1,
    });

    const data = query.data;

    /**
     * Quick check: can the org use a given feature?
     * Why: Components can call `canUse('videoEditor')` without needing
     * to know the tier lookup logic.
     */
    const canUse = (feature: GatedFeature): boolean => {
        if (!data) return false;
        if (data.tier === 'ADMIN' || data.tier === 'ENTERPRISE') return true;

        const limit = data.limits[feature];
        if (typeof limit === 'boolean') return limit;

        const usage = data.usage[feature as keyof BillingUsage];
        if (typeof usage === 'number' && typeof limit === 'number') {
            return usage < limit;
        }
        return !!limit;
    };

    return {
        ...query,
        tier: data?.tier ?? 'FREE',
        display: data?.display ?? { name: 'Free', description: '', color: '#6B7280' },
        limits: data?.limits,
        usage: data?.usage,
        subscription: data?.subscription,
        stripeConfigured: data?.stripeConfigured ?? false,
        isAdmin: data?.tier === 'ADMIN',
        isFreeTier: data?.tier === 'FREE',
        isPastDue: data?.subscription?.status === 'past_due',
        canUse,
    };
}
