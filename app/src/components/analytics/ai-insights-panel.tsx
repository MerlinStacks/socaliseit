/**
 * AI Insights Panel
 * Displays auto-generated plain-English takeaways from analytics data.
 *
 * Why: Users need "so what?" context for their metrics — actionable
 * recommendations rather than just numbers.
 */

'use client';

import { Lightbulb, TrendingUp, TrendingDown, Clock, AlertCircle } from 'lucide-react';
import type { Insight } from '@/app/(dashboard)/analytics/ai-insights';

const ICON_MAP: Record<Insight['category'], React.ReactNode> = {
    positive: <TrendingUp className="h-4 w-4 text-emerald-500 flex-shrink-0" />,
    negative: <TrendingDown className="h-4 w-4 text-red-400 flex-shrink-0" />,
    neutral: <AlertCircle className="h-4 w-4 text-[var(--text-muted)] flex-shrink-0" />,
    tip: <Clock className="h-4 w-4 text-amber-400 flex-shrink-0" />,
};

const BG_MAP: Record<Insight['category'], string> = {
    positive: 'bg-emerald-500/5 border-emerald-500/20',
    negative: 'bg-red-500/5 border-red-500/20',
    neutral: 'bg-[var(--bg-tertiary)] border-[var(--border)]',
    tip: 'bg-amber-500/5 border-amber-500/20',
};

interface AiInsightsPanelProps {
    insights: Insight[];
}

/**
 * Renders a list of AI-generated insight cards.
 */
export function AiInsightsPanel({ insights }: AiInsightsPanelProps) {
    if (insights.length === 0) {
        return (
            <div className="card p-5">
                <div className="flex items-center gap-2 mb-1">
                    <Lightbulb className="h-4 w-4 text-amber-400" />
                    <h3 className="font-semibold">AI Insights</h3>
                </div>
                <p className="text-sm text-[var(--text-muted)]">
                    Not enough data yet — insights will appear after more posts are published.
                </p>
            </div>
        );
    }

    return (
        <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="h-4 w-4 text-amber-400" />
                <h3 className="font-semibold">AI Insights</h3>
                <span className="ml-auto text-xs text-[var(--text-muted)]">
                    {insights.length} insight{insights.length !== 1 ? 's' : ''}
                </span>
            </div>
            <div className="space-y-2.5">
                {insights.map(insight => (
                    <div
                        key={insight.id}
                        className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${BG_MAP[insight.category]}`}
                    >
                        <div className="mt-0.5">{ICON_MAP[insight.category]}</div>
                        <p className="text-sm text-[var(--text-primary)] leading-relaxed">
                            {insight.text}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}
