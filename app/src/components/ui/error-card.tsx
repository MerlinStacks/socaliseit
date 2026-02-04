/**
 * ErrorCard Component
 * Contextual error display with retry functionality
 * Why: Provides actionable recovery instead of generic error messages
 */

import { AlertCircle, RefreshCw, WifiOff, ServerCrash } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

type ErrorType = 'network' | 'server' | 'validation' | 'generic';

interface ErrorCardProps {
    title?: string;
    message: string;
    errorType?: ErrorType;
    onRetry?: () => void;
    retryLabel?: string;
    className?: string;
}

/**
 * Contextual error card with retry button.
 */
export function ErrorCard({
    title,
    message,
    errorType = 'generic',
    onRetry,
    retryLabel = 'Try again',
    className,
}: ErrorCardProps) {
    const errorConfig = {
        network: {
            icon: WifiOff,
            defaultTitle: 'Connection error',
            color: 'text-[var(--warning)]',
            bg: 'bg-[var(--warning-light)]',
        },
        server: {
            icon: ServerCrash,
            defaultTitle: 'Server error',
            color: 'text-[var(--error)]',
            bg: 'bg-[var(--error-light)]',
        },
        validation: {
            icon: AlertCircle,
            defaultTitle: 'Validation error',
            color: 'text-[var(--warning)]',
            bg: 'bg-[var(--warning-light)]',
        },
        generic: {
            icon: AlertCircle,
            defaultTitle: 'Something went wrong',
            color: 'text-[var(--error)]',
            bg: 'bg-[var(--error-light)]',
        },
    };

    const config = errorConfig[errorType];
    const Icon = config.icon;
    const displayTitle = title || config.defaultTitle;

    return (
        <div
            className={cn(
                'rounded-xl border border-[var(--border)] p-6 text-center',
                config.bg,
                className
            )}
        >
            <div className={cn('mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full', config.bg)}>
                <Icon className={cn('h-6 w-6', config.color)} />
            </div>

            <h3 className="mb-2 text-base font-semibold text-[var(--text-primary)]">
                {displayTitle}
            </h3>

            <p className="mb-4 text-sm text-[var(--text-secondary)]">
                {message}
            </p>

            {onRetry && (
                <Button variant="secondary" size="sm" onClick={onRetry}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {retryLabel}
                </Button>
            )}
        </div>
    );
}

/**
 * Inline error message for smaller contexts.
 */
export function InlineError({
    message,
    onRetry,
    className,
}: {
    message: string;
    onRetry?: () => void;
    className?: string;
}) {
    return (
        <div className={cn('flex items-center gap-2 rounded-lg bg-[var(--error-light)] px-3 py-2 text-sm', className)}>
            <AlertCircle className="h-4 w-4 flex-shrink-0 text-[var(--error)]" />
            <span className="flex-1 text-[var(--error)]">{message}</span>
            {onRetry && (
                <button
                    onClick={onRetry}
                    className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-[var(--error)] hover:bg-[var(--error)]/10 transition-colors"
                >
                    <RefreshCw className="h-3 w-3" />
                    Retry
                </button>
            )}
        </div>
    );
}
