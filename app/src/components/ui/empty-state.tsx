'use client';

/**
 * Empty State Component
 * Displays themed illustrations with customizable messaging for empty content areas
 */

import { cn } from '@/lib/utils';
import {
    Image,
    Calendar,
    BarChart3,
    Clock,
    Users,
    MessageSquare,
    Sparkles,
    FolderOpen,
    Search
} from 'lucide-react';
import { Button } from './button';

type EmptyStateVariant =
    | 'media'
    | 'calendar'
    | 'analytics'
    | 'queue'
    | 'team'
    | 'engagement'
    | 'ai'
    | 'folder'
    | 'search'
    | 'default';

interface EmptyStateProps {
    /** Variant determines the illustration type */
    variant?: EmptyStateVariant;
    /** Main heading */
    title: string;
    /** Supporting description */
    description?: string;
    /** Optional contextual tip displayed below the description */
    tip?: string;
    /** Optional action button */
    action?: {
        label: string;
        onClick: () => void;
    };
    /** Additional CSS classes */
    className?: string;
}

const variantConfig: Record<EmptyStateVariant, { icon: typeof Image; gradient: string }> = {
    media: { icon: Image, gradient: 'from-purple-400 to-pink-400' },
    calendar: { icon: Calendar, gradient: 'from-blue-400 to-cyan-400' },
    analytics: { icon: BarChart3, gradient: 'from-green-400 to-emerald-400' },
    queue: { icon: Clock, gradient: 'from-orange-400 to-amber-400' },
    team: { icon: Users, gradient: 'from-indigo-400 to-purple-400' },
    engagement: { icon: MessageSquare, gradient: 'from-pink-400 to-rose-400' },
    ai: { icon: Sparkles, gradient: 'from-[var(--accent-gold)] to-[var(--accent-pink)]' },
    folder: { icon: FolderOpen, gradient: 'from-slate-400 to-gray-400' },
    search: { icon: Search, gradient: 'from-teal-400 to-cyan-400' },
    default: { icon: FolderOpen, gradient: 'from-[var(--accent-gold)] to-[var(--accent-pink)]' },
};

/**
 * Reusable empty state component with themed illustrations
 * @example
 * <EmptyState
 *   variant="media"
 *   title="No media yet"
 *   description="Upload images and videos to your library"
 *   action={{ label: "Upload Media", onClick: () => {} }}
 * />
 */
export function EmptyState({
    variant = 'default',
    title,
    description,
    tip,
    action,
    className
}: EmptyStateProps) {
    const config = variantConfig[variant];
    const Icon = config.icon;

    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center py-16 px-8 text-center',
                'animate-fade-in',
                className
            )}
        >
            {/* Illustration Container */}
            <div className="relative mb-6">
                {/* Background glow effect */}
                <div
                    className={cn(
                        'absolute inset-0 blur-2xl opacity-20 rounded-full scale-150',
                        `bg-gradient-to-br ${config.gradient}`
                    )}
                />

                {/* Glass card with icon */}
                <div
                    className={cn(
                        'relative w-24 h-24 rounded-2xl',
                        'glass-card flex items-center justify-center',
                        'interactive-scale-subtle'
                    )}
                >
                    <div
                        className={cn(
                            'w-12 h-12 rounded-xl flex items-center justify-center',
                            `bg-gradient-to-br ${config.gradient}`
                        )}
                    >
                        <Icon className="w-6 h-6 text-white" strokeWidth={1.75} />
                    </div>
                </div>

                {/* Decorative dots */}
                <div className="absolute -top-2 -right-2 w-3 h-3 rounded-full bg-[var(--accent-gold)] opacity-60 animate-pulse" />
                <div className="absolute -bottom-1 -left-3 w-2 h-2 rounded-full bg-[var(--accent-pink)] opacity-50 animate-pulse" style={{ animationDelay: '0.5s' }} />
            </div>

            {/* Text Content */}
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                {title}
            </h3>

            {description && (
                <p className="text-sm text-[var(--text-secondary)] max-w-sm mb-4">
                    {description}
                </p>
            )}

            {/* Contextual Tip */}
            {tip && (
                <p className="text-xs text-[var(--text-muted)] max-w-sm mb-6 flex items-center justify-center gap-1.5">
                    <span>💡</span> {tip}
                </p>
            )}

            {/* Action Button */}
            {action && (
                <Button
                    onClick={action.onClick}
                    className="btn-interactive"
                >
                    {action.label}
                </Button>
            )}
        </div>
    );
}

/**
 * Compact empty state for inline use (e.g., dropdown menus, small panels)
 */
export function EmptyStateCompact({
    title,
    description,
    className
}: Pick<EmptyStateProps, 'title' | 'description' | 'className'>) {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center py-8 px-4 text-center',
                className
            )}
        >
            <div className="w-10 h-10 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center mb-3">
                <FolderOpen className="w-5 h-5 text-[var(--text-muted)]" strokeWidth={1.75} />
            </div>
            <p className="text-sm font-medium text-[var(--text-secondary)]">{title}</p>
            {description && (
                <p className="text-xs text-[var(--text-muted)] mt-1">{description}</p>
            )}
        </div>
    );
}
