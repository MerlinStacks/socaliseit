/**
 * Billing Settings Component
 *
 * Why: Full billing tab for the settings page. Shows current plan,
 * usage meters, plan comparison cards, and subscription management
 * buttons. ADMIN tier sees a simplified "unlimited" view.
 */

'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { useBilling } from '@/hooks/use-billing';
import { PlanBadge } from './plan-badge';
import { Button } from '@/components/ui/button';
import {
    CreditCard,
    Sparkles,
    Shield,
    ArrowUpRight,
    Loader2,
    AlertTriangle,
    Check,
    Crown,
    Zap,
    Building2,
} from 'lucide-react';
import { PLAN_DISPLAY, PLAN_LIMITS, type PlanLimits } from '@/lib/billing/plan-config';

/** Plan cards shown for upgrade comparison */
const UPGRADE_PLANS = ['PRO', 'BUSINESS', 'ENTERPRISE'] as const;

const PLAN_ICONS: Record<string, React.ReactNode> = {
    PRO: <Zap className="h-5 w-5" />,
    BUSINESS: <Building2 className="h-5 w-5" />,
    ENTERPRISE: <Crown className="h-5 w-5" />,
};



export function BillingSettings() {
    const {
        tier,
        display,
        limits,
        usage,
        subscription,
        stripeConfigured,
        isAdmin,
        isPastDue,
        isLoading,
    } = useBilling();

    const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
    const [portalLoading, setPortalLoading] = useState(false);
    const [priceIds, setPriceIds] = useState<Record<string, string>>({});

    /** Why: Fetch price IDs from server at runtime instead of relying on NEXT_PUBLIC_ build-time vars */
    useEffect(() => {
        fetch('/api/billing/prices')
            .then((r) => r.json())
            .then((data) => {
                if (data.priceIds) setPriceIds(data.priceIds);
            })
            .catch(() => { /* graceful fallback — upgrade buttons just won't show */ });
    }, []);

    /** Redirect to Stripe Checkout for a given plan */
    const handleUpgrade = async (planKey: string) => {
        const priceId = priceIds[planKey];
        if (!priceId) return;

        setCheckoutLoading(planKey);
        try {
            const res = await fetch('/api/billing/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ priceId }),
            });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            }
        } finally {
            setCheckoutLoading(null);
        }
    };

    /** Redirect to Stripe Customer Portal */
    const handleManageSubscription = async () => {
        setPortalLoading(true);
        try {
            const res = await fetch('/api/billing/portal', { method: 'POST' });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            }
        } finally {
            setPortalLoading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Past Due Warning */}
            {isPastDue && (
                <div className="flex items-center gap-3 rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/5 p-4">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--warning)]" />
                    <div className="flex-1">
                        <p className="font-medium text-sm">Payment Failed</p>
                        <p className="text-xs text-[var(--text-muted)]">
                            Please update your payment method to keep your plan active.
                        </p>
                    </div>
                    <Button size="sm" onClick={handleManageSubscription} disabled={portalLoading}>
                        {portalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update Payment'}
                    </Button>
                </div>
            )}

            {/* Current Plan Card */}
            <div className="card p-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div
                            className="flex h-12 w-12 items-center justify-center rounded-xl"
                            style={{ backgroundColor: `${display.color}15` }}
                        >
                            {isAdmin ? (
                                <Shield className="h-6 w-6" style={{ color: display.color }} />
                            ) : (
                                <CreditCard className="h-6 w-6" style={{ color: display.color }} />
                            )}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-lg">Current Plan</h3>
                                <PlanBadge size="md" />
                            </div>
                            <p className="text-sm text-[var(--text-muted)]">{display.description}</p>
                        </div>
                    </div>

                    {subscription?.hasSubscription && !isAdmin && (
                        <Button variant="secondary" onClick={handleManageSubscription} disabled={portalLoading}>
                            {portalLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <>Manage Subscription <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></>
                            )}
                        </Button>
                    )}
                </div>

                {/* Subscription details */}
                {subscription?.hasSubscription && !isAdmin && (
                    <div className="mt-4 flex gap-4 text-xs text-[var(--text-muted)]">
                        <span>
                            Status: <strong className="text-[var(--text-primary)]">
                                {subscription.status === 'active' ? 'Active' :
                                    subscription.status === 'past_due' ? 'Past Due' :
                                        subscription.status === 'trialing' ? 'Trial' :
                                            subscription.status || 'Unknown'}
                            </strong>
                        </span>
                        {subscription.currentPeriodEnd && (
                            <span>
                                {subscription.cancelAtPeriodEnd ? 'Cancels' : 'Renews'}:{' '}
                                <strong className="text-[var(--text-primary)]">
                                    {format(new Date(subscription.currentPeriodEnd), 'MMM d, yyyy')}
                                </strong>
                            </span>
                        )}
                    </div>
                )}

                {isAdmin && (
                    <div className="mt-4 rounded-lg bg-[var(--accent-warm)]/5 border border-[var(--accent-warm)]/20 p-3">
                        <p className="text-sm text-[var(--accent-warm)] font-medium flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            Admin Plan — All features unlimited at $0
                        </p>
                    </div>
                )}
            </div>

            {/* Usage Meters */}
            {limits && usage && (
                <div className="card p-6">
                    <h3 className="font-semibold mb-4">Usage This Month</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <UsageMeter
                            label="Social Accounts"
                            current={usage.socialAccounts}
                            limit={limits.socialAccounts}
                        />
                        <UsageMeter
                            label="Team Members"
                            current={usage.teamMembers}
                            limit={limits.teamMembers}
                        />
                        <UsageMeter
                            label="Scheduled Posts"
                            current={usage.scheduledPostsPerMonth}
                            limit={limits.scheduledPostsPerMonth}
                        />
                        <UsageMeter
                            label="AI Generations"
                            current={usage.aiGenerationsPerMonth}
                            limit={limits.aiGenerationsPerMonth}
                        />
                        <UsageMeter
                            label="Competitors"
                            current={usage.competitorTracking}
                            limit={limits.competitorTracking}
                        />
                    </div>
                </div>
            )}

            {/* Upgrade Plans — hidden for ADMIN and ENTERPRISE */}
            {!isAdmin && tier !== 'ENTERPRISE' && stripeConfigured && (
                <div>
                    <h3 className="font-semibold mb-4">
                        {tier === 'FREE' ? 'Upgrade Your Plan' : 'Available Plans'}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {UPGRADE_PLANS.map((planKey) => {
                            const planDisplay = PLAN_DISPLAY[planKey];
                            const planLimits = PLAN_LIMITS[planKey];
                            const isCurrentPlan = tier === planKey;
                            const tierOrder = ['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE'];
                            const isDowngrade = tierOrder.indexOf(planKey) < tierOrder.indexOf(tier);

                            return (
                                <PlanCard
                                    key={planKey}
                                    planKey={planKey}
                                    display={planDisplay}
                                    limits={planLimits}
                                    isCurrent={isCurrentPlan}
                                    isDowngrade={isDowngrade}
                                    isLoading={checkoutLoading === planKey}
                                    onSelect={() => handleUpgrade(planKey)}
                                />
                            );
                        })}
                    </div>
                </div>
            )}

            {/* No Stripe configured warning */}
            {!stripeConfigured && !isAdmin && (
                <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center">
                    <CreditCard className="mx-auto h-8 w-8 text-[var(--text-muted)] mb-2" />
                    <p className="text-sm text-[var(--text-muted)]">
                        Billing is not configured yet. Contact your administrator to set up Stripe.
                    </p>
                </div>
            )}
        </div>
    );
}

/** Individual usage meter with progress bar */
function UsageMeter({ label, current, limit }: { label: string; current: number; limit: number }) {
    const isUnlimited = !isFinite(limit);
    const percentage = isUnlimited ? 0 : Math.min((current / limit) * 100, 100);
    const isNearLimit = !isUnlimited && percentage >= 80;
    const isAtLimit = !isUnlimited && percentage >= 100;

    return (
        <div className="rounded-lg border border-[var(--border)] p-3">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium">{label}</span>
                <span className={`text-xs font-semibold ${isAtLimit ? 'text-[var(--error)]' : isNearLimit ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]'}`}>
                    {current} / {isUnlimited ? '∞' : limit}
                </span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all ${isAtLimit ? 'bg-[var(--error)]' :
                        isNearLimit ? 'bg-[var(--warning)]' :
                            'bg-[var(--accent-pink)]'
                        }`}
                    style={{ width: isUnlimited ? '0%' : `${percentage}%` }}
                />
            </div>
        </div>
    );
}

/** Plan comparison card */
function PlanCard({
    planKey,
    display,
    limits,
    isCurrent,
    isDowngrade,
    isLoading,
    onSelect,
}: {
    planKey: string;
    display: { name: string; description: string; color: string };
    limits: PlanLimits;
    isCurrent: boolean;
    isDowngrade: boolean;
    isLoading: boolean;
    onSelect: () => void;
}) {
    const features = [
        { label: 'Social accounts', value: isFinite(limits.socialAccounts) ? limits.socialAccounts.toString() : 'Unlimited' },
        { label: 'Team members', value: isFinite(limits.teamMembers) ? limits.teamMembers.toString() : 'Unlimited' },
        { label: 'Posts/month', value: isFinite(limits.scheduledPostsPerMonth) ? limits.scheduledPostsPerMonth.toString() : 'Unlimited' },
        { label: 'AI generations', value: isFinite(limits.aiGenerationsPerMonth) ? limits.aiGenerationsPerMonth.toString() : 'Unlimited' },
        { label: 'Video Editor', value: limits.videoEditor },
        { label: 'Analytics Export', value: limits.analyticsExport },
        { label: 'Custom Branding', value: limits.customBranding },
    ];

    return (
        <div
            className={`relative rounded-xl border p-5 transition-all ${isCurrent
                ? 'border-[var(--accent-pink)] bg-[var(--accent-pink)]/5'
                : 'border-[var(--border)] hover:border-[var(--border-hover)]'
                }`}
        >
            <div className="flex items-center gap-2 mb-1">
                <span style={{ color: display.color }}>{PLAN_ICONS[planKey]}</span>
                <h4 className="font-semibold">{display.name}</h4>
                {isCurrent && (
                    <span className="rounded-full bg-[var(--accent-pink)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--accent-pink)]">
                        Current
                    </span>
                )}
            </div>
            <p className="text-xs text-[var(--text-muted)] mb-4">{display.description}</p>

            <ul className="space-y-2 mb-5">
                {features.map((f) => (
                    <li key={f.label} className="flex items-center gap-2 text-xs">
                        {typeof f.value === 'boolean' ? (
                            f.value ? (
                                <Check className="h-3.5 w-3.5 text-[var(--success)]" />
                            ) : (
                                <X className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                            )
                        ) : (
                            <span className="h-3.5 w-3.5 text-center text-[10px] font-bold" style={{ color: display.color }}>
                                {f.value}
                            </span>
                        )}
                        <span className={typeof f.value === 'boolean' && !f.value ? 'text-[var(--text-muted)]' : ''}>
                            {f.label}
                        </span>
                    </li>
                ))}
            </ul>

            {!isCurrent && (
                <Button
                    onClick={onSelect}
                    disabled={isLoading || isDowngrade}
                    className="w-full"
                    variant={isDowngrade ? 'secondary' : 'primary'}
                >
                    {isLoading ? (
                        <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Processing...</>
                    ) : isDowngrade ? (
                        'Downgrade'
                    ) : (
                        <><Sparkles className="mr-1.5 h-3.5 w-3.5" /> Upgrade to {display.name}</>
                    )}
                </Button>
            )}
        </div>
    );
}

/** X icon for feature list (not available) */
function X({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    );
}
