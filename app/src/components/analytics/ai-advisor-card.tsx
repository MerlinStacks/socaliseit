/**
 * AI Advisor Card — Vista Social-inspired analytics summary.
 *
 * Why: Users need a "so what?" executive summary of their analytics,
 * not just numbers. This card calls the AI advisor API on demand and
 * renders a rich narrative with headline, summary, platform bullets,
 * and expandable recommendations. Falls back to the existing
 * deterministic insights when AI is not configured.
 */

'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Sparkles, Copy, Check, ChevronDown, ChevronUp,
    Loader2, AlertCircle, Plus,
} from 'lucide-react';
import { AiInsightsPanel } from './ai-insights-panel';
import type { Insight } from '@/app/(dashboard)/analytics/ai-insights';
import type { AdvisorResponse, AdvisorMetrics } from '@/lib/ai/analytics-advisor-prompt';

interface AiAdvisorCardProps {
    /** Fallback deterministic insights */
    insights: Insight[];
    /** Metrics payload to send to the advisor API */
    metrics: AdvisorMetrics;
}

type FetchState = 'idle' | 'loading' | 'done' | 'error';

/**
 * Premium AI Advisor card with on-demand generation.
 */
export function AiAdvisorCard({ insights, metrics }: AiAdvisorCardProps) {
    const [state, setState] = useState<FetchState>('idle');
    const [advisor, setAdvisor] = useState<AdvisorResponse | null>(null);
    const [expanded, setExpanded] = useState(true);
    const [showRecs, setShowRecs] = useState(false);
    const [copied, setCopied] = useState(false);
    const [useFallback, setUseFallback] = useState(false);

    const fetchAdvisor = useCallback(async () => {
        setState('loading');
        try {
            const res = await fetch('/api/ai/analytics-advisor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(metrics),
            });

            if (!res.ok) {
                setState('error');
                setUseFallback(true);
                return;
            }

            const json = await res.json();

            if (json.fallback || !json.data) {
                setUseFallback(true);
                setState('done');
                return;
            }

            setAdvisor(json.data);
            setState('done');
        } catch {
            setState('error');
            setUseFallback(true);
        }
    }, [metrics]);

    const handleCopy = useCallback(async () => {
        if (!advisor) return;
        const text = [
            advisor.headline,
            '',
            advisor.summary,
            '',
            ...advisor.bullets.map(b => `• ${b}`),
            '',
            'Recommendations:',
            ...advisor.recommendations.map((r, i) => `${i + 1}. ${r}`),
        ].join('\n');

        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [advisor]);

    // Show fallback deterministic insights
    if (useFallback) {
        return <AiInsightsPanel insights={insights} />;
    }

    // Idle state — show generate button
    if (state === 'idle') {
        return (
            <div className="card overflow-hidden">
                <div className="relative bg-gradient-to-r from-violet-600/10 via-purple-500/10 to-fuchsia-500/10 border-b border-violet-500/20">
                    <div className="px-5 py-4 flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/20">
                            <Sparkles className="h-4 w-4 text-violet-400" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-sm">AI Advisor</h3>
                            <p className="text-xs text-[var(--text-muted)]">
                                Get an AI-powered summary of your performance
                            </p>
                        </div>
                        <button
                            onClick={fetchAdvisor}
                            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-violet-500 transition-colors"
                        >
                            <Sparkles className="h-3.5 w-3.5" />
                            Generate Summary
                        </button>
                    </div>
                </div>
                {/* Show deterministic insights below as preview */}
                {insights.length > 0 && (
                    <div className="px-5 py-3">
                        <p className="text-xs text-[var(--text-muted)] mb-2">Quick insights:</p>
                        <div className="space-y-1.5">
                            {insights.slice(0, 3).map(insight => (
                                <p key={insight.id} className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                    • {insight.text}
                                </p>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Loading state
    if (state === 'loading') {
        return (
            <div className="card overflow-hidden">
                <div className="relative bg-gradient-to-r from-violet-600/10 via-purple-500/10 to-fuchsia-500/10">
                    <div className="px-5 py-6 flex flex-col items-center justify-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20">
                            <Loader2 className="h-5 w-5 text-violet-400 animate-spin" />
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-medium">Analyzing your performance...</p>
                            <p className="text-xs text-[var(--text-muted)] mt-1">
                                Our AI is reviewing your metrics and crafting insights
                            </p>
                        </div>
                        {/* Shimmer lines */}
                        <div className="w-full mt-3 space-y-2.5">
                            <div className="h-4 rounded-md bg-[var(--bg-tertiary)] animate-pulse w-3/4" />
                            <div className="h-3 rounded-md bg-[var(--bg-tertiary)] animate-pulse w-full" />
                            <div className="h-3 rounded-md bg-[var(--bg-tertiary)] animate-pulse w-5/6" />
                            <div className="h-3 rounded-md bg-[var(--bg-tertiary)] animate-pulse w-2/3" />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Error state
    if (state === 'error') {
        return (
            <div className="card p-5">
                <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-4 w-4 text-red-400" />
                    <h3 className="font-semibold text-sm">AI Advisor Unavailable</h3>
                </div>
                <p className="text-xs text-[var(--text-muted)] mb-3">
                    Could not generate AI summary. Showing rule-based insights instead.
                </p>
                <AiInsightsPanel insights={insights} />
            </div>
        );
    }

    // Result state — show the advisor card
    if (!advisor) return <AiInsightsPanel insights={insights} />;

    return (
        <div className="card overflow-hidden">
            {/* Header — purple gradient */}
            <div className="relative bg-gradient-to-r from-violet-600/10 via-purple-500/10 to-fuchsia-500/10 border-b border-violet-500/20">
                <div className="px-5 py-3.5 flex items-start gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/20 mt-0.5 flex-shrink-0">
                        <Sparkles className="h-3.5 w-3.5 text-violet-400" />
                    </div>
                    <p className="flex-1 text-sm font-semibold leading-snug text-[var(--text-primary)]">
                        {advisor.headline}
                    </p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                            onClick={handleCopy}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--bg-tertiary)] transition-colors"
                            title="Copy to clipboard"
                        >
                            {copied
                                ? <Check className="h-3.5 w-3.5 text-emerald-400" />
                                : <Copy className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                            }
                        </button>
                        <button
                            onClick={() => setExpanded(e => !e)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--bg-tertiary)] transition-colors"
                            title={expanded ? 'Collapse' : 'Expand'}
                        >
                            {expanded
                                ? <ChevronUp className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                                : <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                            }
                        </button>
                    </div>
                </div>
            </div>

            {/* Collapsible Body */}
            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <div className="px-5 py-4 space-y-4">
                            {/* Summary paragraph with bold stat rendering */}
                            <p className="text-sm text-[var(--text-secondary)] leading-relaxed"
                                dangerouslySetInnerHTML={{
                                    __html: renderBoldMarkdown(advisor.summary),
                                }}
                            />

                            {/* Platform bullets */}
                            {advisor.bullets.length > 0 && (
                                <ul className="space-y-2">
                                    {advisor.bullets.map((bullet, i) => (
                                        <li key={i} className="flex items-start gap-2.5">
                                            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-violet-400 flex-shrink-0" />
                                            <span
                                                className="text-sm text-[var(--text-secondary)] leading-relaxed"
                                                dangerouslySetInnerHTML={{
                                                    __html: renderBoldMarkdown(bullet),
                                                }}
                                            />
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {/* Recommendations toggle */}
                            {advisor.recommendations.length > 0 && (
                                <div>
                                    <button
                                        onClick={() => setShowRecs(r => !r)}
                                        className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-violet-500 transition-colors ml-auto"
                                    >
                                        {showRecs ? (
                                            <>
                                                <ChevronUp className="h-3.5 w-3.5" />
                                                Hide recommendations
                                            </>
                                        ) : (
                                            <>
                                                <Plus className="h-3.5 w-3.5" />
                                                View recommendations
                                            </>
                                        )}
                                    </button>

                                    <AnimatePresence>
                                        {showRecs && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="mt-3 rounded-lg border border-violet-500/20 bg-violet-500/5 p-4 space-y-2">
                                                    {advisor.recommendations.map((rec, i) => (
                                                        <div key={i} className="flex items-start gap-2.5">
                                                            <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-violet-500/20 text-[10px] font-bold text-violet-400 flex-shrink-0">
                                                                {i + 1}
                                                            </span>
                                                            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                                                                {rec}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert **bold** markdown syntax to <strong> tags for inline rendering.
 * Why: The LLM returns bold stat callouts as **1,238,699** — we need to
 * render them with proper emphasis without pulling in a full markdown parser.
 */
function renderBoldMarkdown(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-[var(--text-primary)]">$1</strong>');
}
