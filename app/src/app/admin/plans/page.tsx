'use client';

/**
 * Plan Editor Page
 *
 * Why: Lets super admins configure tier limits, display metadata, and
 * pricing labels. Changes propagate to the public landing page and
 * billing UI via the /api/plans endpoint.
 */

import { useState, useEffect, useCallback } from 'react';
import {
    Layers, Save, Loader2, RotateCcw, Eye,
    Crown, Zap, Building2, Gift,
} from 'lucide-react';
import { clientLogger } from '@/lib/client-logger';

interface PlanConfig {
    tier: string;
    displayName: string;
    description: string;
    color: string;
    priceMonthly: number;
    pricingLabel: string;
    pricingPeriod: string;
    popular: boolean;
    ctaText: string;
    socialAccounts: number;
    teamMembers: number;
    scheduledPostsPerMonth: number;
    aiGenerationsPerMonth: number;
    competitorTracking: number;
    videoEditor: boolean;
    analyticsExport: boolean;
    customBranding: boolean;
    prioritySupport: boolean;
    featureBullets: string[];
}

const TIER_ICONS: Record<string, React.ReactNode> = {
    FREE: <Gift className="h-5 w-5" />,
    PRO: <Zap className="h-5 w-5" />,
    BUSINESS: <Building2 className="h-5 w-5" />,
    ENTERPRISE: <Crown className="h-5 w-5" />,
};

const TIER_ORDER = ['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE'];

/**
 * Why: Formats -1 as "Unlimited" for display. DB uses -1 to represent Infinity
 * since JSON/Postgres don't support Infinity.
 */
function formatLimit(val: number): string {
    return val === -1 ? 'Unlimited' : val.toString();
}

export default function PlansPage() {
    const [plans, setPlans] = useState<PlanConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingTier, setSavingTier] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [previewTier, setPreviewTier] = useState<string | null>(null);

    const fetchPlans = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/plans');
            const data = await res.json();
            // Why: Sort by tier order so the UI is always FREE → PRO → BUSINESS → ENTERPRISE
            const sorted = (data.plans as PlanConfig[]).sort(
                (a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)
            );
            setPlans(sorted);
        } catch (error) {
            clientLogger.error({ error }, 'Failed to fetch plans');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchPlans(); }, [fetchPlans]);

    /** Persists a single tier's config to the backend */
    const savePlan = async (plan: PlanConfig) => {
        setSavingTier(plan.tier);
        setMessage(null);
        try {
            const res = await fetch('/api/admin/plans', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(plan),
            });
            if (res.ok) {
                const data = await res.json();
                setPlans((prev) => prev.map((p) => p.tier === data.plan.tier ? data.plan : p));
                setMessage({ type: 'success', text: `${plan.displayName} plan saved` });
            } else {
                const error = await res.json();
                setMessage({ type: 'error', text: error.message || 'Failed to save' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Network error — could not save' });
        } finally {
            setSavingTier(null);
        }
    };

    /** Updates a field on a specific tier's local state */
    const updatePlan = (tier: string, field: string, value: unknown) => {
        setPlans((prev) =>
            prev.map((p) => p.tier === tier ? { ...p, [field]: value } : p)
        );
    };

    /** Updates a feature bullet at a given index */
    const updateBullet = (tier: string, idx: number, value: string) => {
        setPlans((prev) =>
            prev.map((p) => {
                if (p.tier !== tier) return p;
                const bullets = [...p.featureBullets];
                bullets[idx] = value;
                return { ...p, featureBullets: bullets };
            })
        );
    };

    /** Adds a new bullet to a tier */
    const addBullet = (tier: string) => {
        setPlans((prev) =>
            prev.map((p) => {
                if (p.tier !== tier || p.featureBullets.length >= 10) return p;
                return { ...p, featureBullets: [...p.featureBullets, ''] };
            })
        );
    };

    /** Removes a bullet from a tier */
    const removeBullet = (tier: string, idx: number) => {
        setPlans((prev) =>
            prev.map((p) => {
                if (p.tier !== tier) return p;
                const bullets = p.featureBullets.filter((_, i) => i !== idx);
                return { ...p, featureBullets: bullets };
            })
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-white">Plan Configuration</h1>
                    <p className="text-gray-400 mt-1">
                        Edit tier limits, pricing labels, and feature lists
                    </p>
                </div>
            </div>

            {message && (
                <div className={`mb-6 rounded-lg p-4 ${message.type === 'success'
                    ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                    : 'bg-red-500/10 border border-red-500/30 text-red-400'
                    }`}>
                    {message.text}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {plans.map((plan) => (
                    <div
                        key={plan.tier}
                        className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden"
                    >
                        {/* Card Header */}
                        <div
                            className="flex items-center justify-between px-6 py-4 border-b border-gray-800"
                            style={{ borderLeftWidth: 4, borderLeftColor: plan.color }}
                        >
                            <div className="flex items-center gap-3">
                                <span style={{ color: plan.color }}>{TIER_ICONS[plan.tier]}</span>
                                <div>
                                    <h3 className="font-semibold text-white">{plan.tier}</h3>
                                    <p className="text-xs text-gray-500">{plan.displayName} — {plan.pricingLabel}{plan.pricingPeriod}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPreviewTier(previewTier === plan.tier ? null : plan.tier)}
                                    className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                                    title="Preview pricing card"
                                >
                                    <Eye className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={() => savePlan(plan)}
                                    disabled={savingTier === plan.tier}
                                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                >
                                    {savingTier === plan.tier
                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        : <Save className="h-3.5 w-3.5" />}
                                    Save
                                </button>
                            </div>
                        </div>

                        {/* Preview Card */}
                        {previewTier === plan.tier && (
                            <div className="px-6 py-4 bg-gray-950 border-b border-gray-800">
                                <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider">Landing Page Preview</p>
                                <PricingCardPreview plan={plan} />
                            </div>
                        )}

                        {/* Editable Fields */}
                        <div className="p-6 space-y-5">
                            {/* Display Section */}
                            <fieldset>
                                <legend className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Display</legend>
                                <div className="grid grid-cols-2 gap-3">
                                    <LabeledInput label="Name" value={plan.displayName}
                                        onChange={(v) => updatePlan(plan.tier, 'displayName', v)} />
                                    <LabeledInput label="Color" value={plan.color} type="color"
                                        onChange={(v) => updatePlan(plan.tier, 'color', v)} />
                                    <LabeledInput label="Description" value={plan.description} className="col-span-2"
                                        onChange={(v) => updatePlan(plan.tier, 'description', v)} />
                                </div>
                            </fieldset>

                            {/* Pricing Section */}
                            <fieldset>
                                <legend className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Pricing Display</legend>
                                <div className="grid grid-cols-3 gap-3">
                                    <LabeledInput label="Label" value={plan.pricingLabel}
                                        onChange={(v) => updatePlan(plan.tier, 'pricingLabel', v)} />
                                    <LabeledInput label="Period" value={plan.pricingPeriod}
                                        onChange={(v) => updatePlan(plan.tier, 'pricingPeriod', v)} />
                                    <LabeledInput label="CTA" value={plan.ctaText}
                                        onChange={(v) => updatePlan(plan.tier, 'ctaText', v)} />
                                </div>
                                <label className="flex items-center gap-2 mt-3 text-xs text-gray-400 cursor-pointer">
                                    <input type="checkbox" checked={plan.popular}
                                        onChange={(e) => updatePlan(plan.tier, 'popular', e.target.checked)}
                                        className="rounded border-gray-700 bg-gray-800 accent-blue-500" />
                                    Mark as "Most Popular"
                                </label>
                            </fieldset>

                            {/* Limits Section */}
                            <fieldset>
                                <legend className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                    Numerical Limits <span className="font-normal text-gray-600">(-1 = Unlimited)</span>
                                </legend>
                                <div className="grid grid-cols-2 gap-3">
                                    <LabeledInput label="Social Accounts" type="number" value={plan.socialAccounts.toString()}
                                        onChange={(v) => updatePlan(plan.tier, 'socialAccounts', parseInt(v, 10) || 0)} />
                                    <LabeledInput label="Team Members" type="number" value={plan.teamMembers.toString()}
                                        onChange={(v) => updatePlan(plan.tier, 'teamMembers', parseInt(v, 10) || 0)} />
                                    <LabeledInput label="Posts/Month" type="number" value={plan.scheduledPostsPerMonth.toString()}
                                        onChange={(v) => updatePlan(plan.tier, 'scheduledPostsPerMonth', parseInt(v, 10) || 0)} />
                                    <LabeledInput label="AI Gens/Month" type="number" value={plan.aiGenerationsPerMonth.toString()}
                                        onChange={(v) => updatePlan(plan.tier, 'aiGenerationsPerMonth', parseInt(v, 10) || 0)} />
                                    <LabeledInput label="Competitors" type="number" value={plan.competitorTracking.toString()}
                                        onChange={(v) => updatePlan(plan.tier, 'competitorTracking', parseInt(v, 10) || 0)} />
                                </div>
                            </fieldset>

                            {/* Boolean Flags */}
                            <fieldset>
                                <legend className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Feature Flags</legend>
                                <div className="grid grid-cols-2 gap-2">
                                    {([
                                        ['videoEditor', 'Video Editor'],
                                        ['analyticsExport', 'Analytics Export'],
                                        ['customBranding', 'Custom Branding'],
                                        ['prioritySupport', 'Priority Support'],
                                    ] as const).map(([key, label]) => (
                                        <label key={key} className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer py-1">
                                            <input type="checkbox"
                                                checked={plan[key as keyof PlanConfig] as boolean}
                                                onChange={(e) => updatePlan(plan.tier, key, e.target.checked)}
                                                className="rounded border-gray-700 bg-gray-800 accent-blue-500" />
                                            {label}
                                        </label>
                                    ))}
                                </div>
                            </fieldset>

                            {/* Feature Bullets */}
                            <fieldset>
                                <legend className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                    Pricing Card Bullets
                                </legend>
                                <div className="space-y-2">
                                    {plan.featureBullets.map((bullet, idx) => (
                                        <div key={idx} className="flex items-center gap-2">
                                            <span className="text-gray-600 text-xs w-4 text-right">{idx + 1}</span>
                                            <input
                                                type="text"
                                                value={bullet}
                                                onChange={(e) => updateBullet(plan.tier, idx, e.target.value)}
                                                className="flex-1 rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
                                            />
                                            <button
                                                onClick={() => removeBullet(plan.tier, idx)}
                                                className="text-gray-600 hover:text-red-400 text-xs transition-colors"
                                                title="Remove bullet"
                                            >✕</button>
                                        </div>
                                    ))}
                                    {plan.featureBullets.length < 10 && (
                                        <button
                                            onClick={() => addBullet(plan.tier)}
                                            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                        >+ Add bullet</button>
                                    )}
                                </div>
                            </fieldset>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ── Helper Components ── */

function LabeledInput({
    label, value, onChange, type = 'text', className = '',
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    type?: string;
    className?: string;
}) {
    return (
        <div className={className}>
            <label className="block text-xs text-gray-500 mb-1">{label}</label>
            {type === 'color' ? (
                <div className="flex items-center gap-2">
                    <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
                        className="h-8 w-8 rounded cursor-pointer border border-gray-700 bg-gray-800" />
                    <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
                        className="flex-1 rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none" />
                </div>
            ) : (
                <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
                    className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none" />
            )}
        </div>
    );
}

/** Mini preview of how the pricing card looks on the landing page */
function PricingCardPreview({ plan }: { plan: PlanConfig }) {
    return (
        <div className={`rounded-2xl border p-5 max-w-[280px] mx-auto ${plan.popular
            ? 'border-amber-500/50 bg-gradient-to-b from-amber-500/5 to-transparent'
            : 'border-gray-700 bg-gray-900'
            }`}>
            {plan.popular && (
                <div className="text-center mb-3">
                    <span className="inline-block rounded-full bg-gradient-to-r from-amber-500 to-pink-400 px-3 py-0.5 text-[10px] font-semibold text-white">
                        Most Popular
                    </span>
                </div>
            )}
            <h4 className="text-base font-bold text-white">{plan.displayName}</h4>
            <p className="text-xs text-gray-400 mt-0.5">{plan.description}</p>
            <div className="mt-3 flex items-baseline gap-0.5">
                <span className="text-2xl font-extrabold text-white">{plan.pricingLabel}</span>
                {plan.pricingPeriod && <span className="text-xs text-gray-500">{plan.pricingPeriod}</span>}
            </div>
            <ul className="mt-3 space-y-1.5">
                {plan.featureBullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-300">
                        <span className="text-green-400 mt-0.5">✓</span>
                        {b}
                    </li>
                ))}
            </ul>
            <div className="mt-4 rounded-full py-1.5 text-center text-xs font-medium"
                style={{
                    backgroundColor: `${plan.color}20`,
                    color: plan.color,
                    border: `1px solid ${plan.color}40`,
                }}>
                {plan.ctaText}
            </div>
        </div>
    );
}
