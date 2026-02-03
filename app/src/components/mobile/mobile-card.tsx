/**
 * Mobile Card Component
 * Reusable card with glassmorphism styling for mobile layouts
 * 
 * Why: Provides consistent mobile-first card styling across all mobile views
 */

'use client';

import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface MobileCardProps {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
    /** Whether to add press feedback animation */
    interactive?: boolean;
}

/**
 * Standard mobile card with glassmorphism effect
 */
export function MobileCard({ children, className, onClick, interactive = false }: MobileCardProps) {
    return (
        <div
            onClick={onClick}
            className={cn(
                'rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/80 backdrop-blur-sm p-4',
                interactive && 'active:scale-[0.98] transition-transform cursor-pointer',
                className
            )}
        >
            {children}
        </div>
    );
}

interface MobileStatCardProps {
    label: string;
    value: string | number;
    /** Icon element - pass a rendered icon like <Users className="..." /> */
    icon: React.ReactNode;
    iconBgColor?: string;
    subtext?: string;
    change?: number;
    onClick?: () => void;
}

/**
 * Compact stat card for mobile dashboards
 */
export function MobileStatCard({
    label,
    value,
    icon,
    iconBgColor = 'bg-[var(--accent-gold-light)]',
    subtext,
    change,
    onClick,
}: MobileStatCardProps) {
    return (
        <MobileCard
            onClick={onClick}
            interactive={!!onClick}
            className="flex flex-col gap-2"
        >
            <div className="flex items-center justify-between">
                <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', iconBgColor)}>
                    {icon}
                </div>
                {change !== undefined && (
                    <div className={cn(
                        'flex items-center gap-0.5 text-xs',
                        change >= 0 ? 'text-[var(--success)]' : 'text-[var(--error)]'
                    )}>
                        {change >= 0 ? (
                            <TrendingUp className="h-3 w-3" />
                        ) : (
                            <TrendingDown className="h-3 w-3" />
                        )}
                        <span>{change >= 0 ? '+' : ''}{Math.round(change)}%</span>
                    </div>
                )}
            </div>
            <div>
                <p className="text-xl font-bold">{value}</p>
                <p className="text-xs text-[var(--text-muted)]">{label}</p>
                {subtext && (
                    <p className="text-xs text-[var(--text-muted)]">{subtext}</p>
                )}
            </div>
        </MobileCard>
    );
}

interface MobileListItemProps {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
    showChevron?: boolean;
}

/**
 * List item for mobile lists with optional chevron
 */
export function MobileListItem({ children, className, onClick, showChevron }: MobileListItemProps) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 text-left transition-colors active:bg-[var(--bg-tertiary)]',
                className
            )}
        >
            <div className="min-w-0 flex-1">{children}</div>
            {showChevron && (
                <svg className="h-5 w-5 flex-shrink-0 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
            )}
        </button>
    );
}

/**
 * Skeleton loader for mobile cards
 */
export function MobileCardSkeleton({ className }: { className?: string }) {
    return (
        <div className={cn('animate-pulse rounded-xl bg-[var(--bg-secondary)] h-24', className)} />
    );
}
