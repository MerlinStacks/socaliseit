'use client';

import { useState, useEffect } from 'react';
import { Sparkles, TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { PredictionResult, PredictionFactor } from '@/lib/ai/content-prediction';

interface ContentPredictionCardProps {
    caption: string;
    platforms: string[];
    hasMedia: boolean;
    mediaType?: 'image' | 'video' | 'carousel';
    scheduledHour?: number;
    scheduledDayOfWeek?: number;
}

export function ContentPredictionCard({
    caption,
    platforms,
    hasMedia,
    mediaType,
    scheduledHour,
    scheduledDayOfWeek,
}: ContentPredictionCardProps) {
    const [prediction, setPrediction] = useState<PredictionResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    // Debounce input to fetch prediction score without spamming the API
    useEffect(() => {
        if (!caption && !hasMedia) {
            setPrediction(null);
            return;
        }

        const hashtags = caption.match(/#[\w\u00C0-\u024F]+/g)?.map(t => t.slice(1)) || [];

        const fetchPrediction = async () => {
            setIsLoading(true);
            try {
                const res = await fetch('/api/ai/predict-score', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        caption,
                        platforms,
                        hashtags,
                        hasMedia,
                        mediaType,
                        scheduledHour,
                        scheduledDayOfWeek,
                    }),
                });

                if (res.ok) {
                    const data = await res.json();
                    setPrediction(data);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        const timer = setTimeout(fetchPrediction, 1000);
        return () => clearTimeout(timer);
    }, [caption, platforms, hasMedia, mediaType, scheduledHour, scheduledDayOfWeek]);

    if (!caption && !hasMedia) {
        return null; // Don't show if empty
    }

    return (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50 overflow-hidden transition-all">
            {/* Header: Always visible */}
            <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    <div className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-lg shadow-sm transition-colors",
                        prediction
                            ? prediction.overallScore >= 70 ? 'bg-emerald-500/10 text-emerald-500'
                                : prediction.overallScore >= 40 ? 'bg-amber-500/10 text-amber-500'
                                    : 'bg-red-500/10 text-red-500'
                            : 'bg-[var(--border)] text-[var(--text-muted)]'
                    )}>
                        <Sparkles className={cn("h-3.5 w-3.5", isLoading && "animate-pulse")} />
                    </div>
                    <div>
                        <h4 className="text-xs font-semibold">Predicted Engagement</h4>
                        <p className="text-[10px] text-[var(--text-muted)]">Based on historical data</p>
                    </div>
                </div>

                <div className="text-right">
                    {isLoading || !prediction ? (
                        <div className="h-6 w-12 rounded-md bg-[var(--border)]/50 animate-pulse" />
                    ) : (
                        <div className="flex flex-col items-end">
                            <span className={cn(
                                "text-sm font-black leading-none",
                                prediction.overallScore >= 70 ? 'text-emerald-500'
                                    : prediction.overallScore >= 40 ? 'text-amber-500'
                                        : 'text-red-500'
                            )}>
                                {prediction.overallScore}/100
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)] mt-0.5">Score</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Expandable Body */}
            <AnimatePresence>
                {isExpanded && prediction && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-[var(--border)] overflow-hidden"
                    >
                        <div className="p-3 space-y-4">
                            {/* Recommendations Array */}
                            {prediction.recommendations.length > 0 && (
                                <div className="space-y-1.5">
                                    <h5 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Tips to Improve</h5>
                                    {prediction.recommendations.map((rec, i) => (
                                        <div key={i} className="flex items-start gap-2 rounded-lg bg-[var(--accent-gold)]/5 p-2 border border-[var(--accent-gold)]/10">
                                            <Info className="mt-0.5 h-3 w-3 flex-shrink-0 text-[var(--accent-gold)]" />
                                            <p className="text-xs text-[var(--text-primary)]">{rec}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Impact Factors List */}
                            <div className="space-y-1.5">
                                <h5 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Score Factors</h5>
                                <div className="grid gap-2">
                                    {prediction.factors.map((factor, i) => (
                                        <div key={i} className="flex items-center justify-between text-xs border-b border-[var(--border)]/50 pb-1.5 last:border-0 last:pb-0">
                                            <div className="flex items-center gap-2">
                                                {factor.impact === 'positive' && <TrendingUp className="h-3 w-3 text-emerald-500" />}
                                                {factor.impact === 'negative' && <TrendingDown className="h-3 w-3 text-red-500" />}
                                                {factor.impact === 'neutral' && <Minus className="h-3 w-3 text-[var(--text-muted)]" />}
                                                <span className="font-medium text-[var(--text-secondary)]">{factor.name}</span>
                                            </div>
                                            <span className="text-[10px] text-[var(--text-muted)] w-1/2 text-right truncate" title={factor.description}>
                                                {factor.description}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
