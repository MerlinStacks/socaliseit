'use client';

/**
 * AI Reasoning Components
 * Shows why AI suggested specific content/times
 * Why: Transparency builds user trust in AI recommendations
 */

import { Sparkles, TrendingUp, Clock, Users, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AIReason {
    type: 'timing' | 'audience' | 'trend' | 'performance' | 'suggestion';
    text: string;
    confidence?: number;
}

interface AIReasoningBadgeProps {
    reasons: AIReason[];
    compact?: boolean;
    className?: string;
}

const reasonIcons = {
    timing: Clock,
    audience: Users,
    trend: TrendingUp,
    performance: TrendingUp,
    suggestion: Lightbulb,
};

/**
 * Compact badge showing AI reasoning
 */
export function AIReasoningBadge({ reasons, compact = false, className }: AIReasoningBadgeProps) {
    if (!reasons || reasons.length === 0) return null;

    if (compact) {
        return (
            <div
                className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1',
                    'bg-purple-500/10 text-purple-400 text-xs',
                    className
                )}
                title={reasons.map(r => r.text).join(' • ')}
            >
                <Sparkles className="h-3 w-3" />
                <span>AI Suggested</span>
            </div>
        );
    }

    return (
        <div className={cn('space-y-2', className)}>
            <div className="flex items-center gap-1.5 text-xs font-medium text-purple-400">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Why AI suggested this</span>
            </div>
            <ul className="space-y-1.5">
                {reasons.map((reason, idx) => {
                    const Icon = reasonIcons[reason.type] || Lightbulb;
                    return (
                        <li
                            key={idx}
                            className="flex items-start gap-2 text-xs text-[var(--text-muted)]"
                        >
                            <Icon className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-[var(--text-secondary)]" />
                            <span>{reason.text}</span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/**
 * Time slot reasoning component
 */
interface TimeSlotReasoningProps {
    time: string;
    reasons: string[];
    score?: number;
    className?: string;
}

export function TimeSlotReasoning({ time, reasons, score, className }: TimeSlotReasoningProps) {
    return (
        <div
            className={cn(
                'rounded-lg border border-purple-500/30 bg-purple-500/5 p-3',
                className
            )}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-purple-400" />
                    <span className="font-medium text-[var(--text-primary)]">{time}</span>
                </div>
                {score !== undefined && (
                    <span className="text-xs font-medium text-purple-400">
                        {Math.round(score * 100)}% match
                    </span>
                )}
            </div>
            <ul className="mt-2 space-y-1">
                {reasons.map((reason, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                        <span className="text-purple-400">•</span>
                        <span>{reason}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/**
 * Content performance prediction
 */
interface PerformancePredictionProps {
    engagement: number;
    reach: number;
    confidence: number;
    className?: string;
}

export function PerformancePrediction({
    engagement,
    reach,
    confidence,
    className,
}: PerformancePredictionProps) {
    const confidenceLabel = confidence >= 0.8 ? 'High' : confidence >= 0.5 ? 'Medium' : 'Low';
    const confidenceColor = confidence >= 0.8 ? 'text-green-400' : confidence >= 0.5 ? 'text-amber-400' : 'text-gray-400';

    return (
        <div className={cn('rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4', className)}>
            <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-[var(--accent-gold)]" />
                <span className="text-sm font-medium">Predicted Performance</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <p className="text-xs text-[var(--text-muted)]">Engagement</p>
                    <p className="text-lg font-bold text-[var(--text-primary)]">
                        {engagement.toLocaleString()}
                    </p>
                </div>
                <div>
                    <p className="text-xs text-[var(--text-muted)]">Reach</p>
                    <p className="text-lg font-bold text-[var(--text-primary)]">
                        {reach.toLocaleString()}
                    </p>
                </div>
            </div>

            <div className="mt-3 pt-3 border-t border-[var(--border)]">
                <span className={cn('text-xs', confidenceColor)}>
                    {confidenceLabel} confidence ({Math.round(confidence * 100)}%)
                </span>
            </div>
        </div>
    );
}

/**
 * Hashtag recommendation component
 */
interface HashtagRecommendation {
    tag: string;
    usage: number;
    relevance: number;
}

interface HashtagRecommendationsProps {
    recommendations: HashtagRecommendation[];
    onSelect: (tag: string) => void;
    className?: string;
}

export function HashtagRecommendations({
    recommendations,
    onSelect,
    className,
}: HashtagRecommendationsProps) {
    if (!recommendations || recommendations.length === 0) return null;

    return (
        <div className={cn('space-y-2', className)}>
            <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
                <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                <span>Suggested hashtags</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {recommendations.map((rec) => (
                    <button
                        key={rec.tag}
                        onClick={() => onSelect(rec.tag)}
                        className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2.5 py-1',
                            'bg-[var(--bg-tertiary)] text-xs text-[var(--text-secondary)]',
                            'hover:bg-[var(--accent-gold-light)] hover:text-[var(--accent-gold)]',
                            'transition-colors cursor-pointer'
                        )}
                        title={`Used ${rec.usage.toLocaleString()} times • ${Math.round(rec.relevance * 100)}% relevant`}
                    >
                        #{rec.tag}
                    </button>
                ))}
            </div>
        </div>
    );
}
