'use client';

/**
 * Contextual Empty States
 * Smart empty states with AI-powered suggestions
 * Why: Empty states should guide users to action, not just show "nothing here"
 */

import { Calendar, Clock, Sparkles, Plus, TrendingUp, Users, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateAction {
    label: string;
    onClick?: () => void;
    href?: string;
    variant?: 'primary' | 'secondary';
}

interface ContextualEmptyStateProps {
    type: 'calendar' | 'posts' | 'analytics' | 'media' | 'accounts';
    title?: string;
    description?: string;
    suggestions?: string[];
    actions?: EmptyStateAction[];
    bestTimes?: { time: string; reason: string }[];
    className?: string;
}

const defaultConfigs: Record<string, {
    icon: typeof Calendar;
    title: string;
    description: string;
    suggestions: string[];
}> = {
    calendar: {
        icon: Calendar,
        title: 'No posts scheduled',
        description: 'Your calendar is empty. Let AI help you find the best times to post.',
        suggestions: [
            'Based on your audience, weekday mornings get 47% more engagement',
            'Try posting during lunch hours (12-1 PM) for maximum reach',
            'Consistency matters - aim for 3-5 posts per platform per week',
        ],
    },
    posts: {
        icon: Plus,
        title: 'No posts yet',
        description: 'Create your first post to get started.',
        suggestions: [
            'Start with a carousel post - they get 3x more engagement',
            'Add relevant hashtags to increase discoverability',
            'Include a call-to-action to drive engagement',
        ],
    },
    analytics: {
        icon: TrendingUp,
        title: 'No analytics data',
        description: 'Publish some posts to start tracking performance.',
        suggestions: [
            'Analytics update within 24 hours of posting',
            'Compare performance across platforms',
            'Track best-performing content types',
        ],
    },
    media: {
        icon: Plus,
        title: 'No media files',
        description: 'Upload images and videos to use in your posts.',
        suggestions: [
            'High-quality visuals get 2.3x more engagement',
            'Vertical video (9:16) performs best on mobile',
            'Organize media into folders for easy access',
        ],
    },
    accounts: {
        icon: Users,
        title: 'No accounts connected',
        description: 'Connect your social media accounts to start posting.',
        suggestions: [
            'Connect multiple accounts to compare performance',
            'Each platform has unique best practices',
            'Schedule posts for optimal timing per platform',
        ],
    },
};

/**
 * Contextual empty state with AI suggestions
 */
export function ContextualEmptyState({
    type,
    title,
    description,
    suggestions,
    actions,
    bestTimes,
    className,
}: ContextualEmptyStateProps) {
    const config = defaultConfigs[type] || defaultConfigs.posts;
    const Icon = config.icon;

    const displayTitle = title || config.title;
    const displayDescription = description || config.description;
    const displaySuggestions = suggestions || config.suggestions;

    return (
        <div className={cn('flex flex-col items-center justify-center py-12 px-4 text-center', className)}>
            {/* Icon */}
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-gold-light)]">
                <Icon className="h-8 w-8 text-[var(--accent-gold)]" />
            </div>

            {/* Title & Description */}
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">{displayTitle}</h3>
            <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">{displayDescription}</p>

            {/* Best Times (if calendar) */}
            {bestTimes && bestTimes.length > 0 && (
                <div className="mt-6 w-full max-w-md">
                    <div className="flex items-center justify-center gap-2 text-xs font-medium text-purple-400 mb-3">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>AI-Recommended posting times</span>
                    </div>
                    <div className="grid gap-2">
                        {bestTimes.slice(0, 3).map((slot, idx) => (
                            <div
                                key={idx}
                                className="flex items-center gap-3 rounded-lg border border-purple-500/30 bg-purple-500/5 px-4 py-3"
                            >
                                <Clock className="h-4 w-4 text-purple-400" />
                                <div className="text-left">
                                    <p className="text-sm font-medium text-[var(--text-primary)]">{slot.time}</p>
                                    <p className="text-xs text-[var(--text-muted)]">{slot.reason}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* AI Suggestions */}
            <div className="mt-6 w-full max-w-md">
                <div className="flex items-center justify-center gap-2 text-xs font-medium text-[var(--accent-gold)] mb-3">
                    <Zap className="h-3.5 w-3.5" />
                    <span>Tips for success</span>
                </div>
                <ul className="space-y-2 text-left">
                    {displaySuggestions.map((suggestion, idx) => (
                        <li
                            key={idx}
                            className="flex items-start gap-2 text-xs text-[var(--text-muted)]"
                        >
                            <span className="text-[var(--accent-gold)] mt-0.5">•</span>
                            <span>{suggestion}</span>
                        </li>
                    ))}
                </ul>
            </div>

            {/* Actions */}
            {actions && actions.length > 0 && (
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                    {actions.map((action, idx) => (
                        <Button
                            key={idx}
                            onClick={action.onClick}
                            variant={action.variant === 'secondary' ? 'secondary' : 'primary'}
                            size="lg"
                        >
                            {action.label}
                        </Button>
                    ))}
                </div>
            )}
        </div>
    );
}

export default ContextualEmptyState;
