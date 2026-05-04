'use client';

/**
 * Auto-Save Indicator Component
 * Shows auto-save status in compose header
 * Why: Users need to know their work is being saved
 */

import { Cloud, CloudOff, Check, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { useEffect, useState } from 'react';

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

interface AutoSaveIndicatorProps {
    status: AutoSaveStatus;
    lastSaved?: Date | null;
    error?: string | null;
    className?: string;
}

/**
 * Compact auto-save status indicator
 */
export function AutoSaveIndicator({
    status,
    lastSaved,
    error,
    className,
}: AutoSaveIndicatorProps) {
    const [timeAgo, setTimeAgo] = useState<string>('');

    // Update "X ago" text every minute
    useEffect(() => {
        if (!lastSaved) return;

        const updateTimeAgo = () => {
            setTimeAgo(formatDistanceToNow(lastSaved, { addSuffix: true }));
        };

        updateTimeAgo();
        const interval = setInterval(updateTimeAgo, 60000);
        return () => clearInterval(interval);
    }, [lastSaved]);

    const configs: Record<AutoSaveStatus, {
        icon: typeof Cloud;
        text: string;
        className: string;
        animate?: boolean;
    }> = {
        idle: {
            icon: Cloud,
            text: lastSaved ? `Saved ${timeAgo}` : 'Draft',
            className: 'text-[var(--text-muted)]',
        },
        saving: {
            icon: Loader2,
            text: 'Saving...',
            className: 'text-[var(--accent-gold)]',
            animate: true,
        },
        saved: {
            icon: Check,
            text: 'Saved',
            className: 'text-green-500',
        },
        error: {
            icon: AlertCircle,
            text: error || 'Save failed',
            className: 'text-red-500',
        },
        offline: {
            icon: CloudOff,
            text: 'Offline - changes saved locally',
            className: 'text-amber-500',
        },
    };

    const config = configs[status];
    const Icon = config.icon;

    return (
        <div
            className={cn(
                'flex items-center gap-1.5 text-xs transition-colors',
                config.className,
                className
            )}
            title={error || undefined}
        >
            <Icon className={cn('h-3.5 w-3.5', config.animate && 'animate-spin')} />
            <span className="hidden sm:inline">{config.text}</span>
            <span className="sm:hidden" title={config.text}>
                {config.text.split(' ')[0]}
            </span>
        </div>
    );
}

/**
 * Simple badge variant for tight spaces
 */
export function AutoSaveBadge({ status }: { status: AutoSaveStatus }) {
    const colors: Record<AutoSaveStatus, string> = {
        idle: 'bg-gray-500/20 text-gray-400',
        saving: 'bg-amber-500/20 text-amber-400',
        saved: 'bg-green-500/20 text-green-400',
        error: 'bg-red-500/20 text-red-400',
        offline: 'bg-amber-500/20 text-amber-400',
    };

    const icons: Record<AutoSaveStatus, typeof Cloud> = {
        idle: Cloud,
        saving: Loader2,
        saved: Check,
        error: AlertCircle,
        offline: CloudOff,
    };

    const Icon = icons[status];

    return (
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', colors[status])}>
            <Icon className={cn('h-3 w-3', status === 'saving' && 'animate-spin')} />
        </span>
    );
}
