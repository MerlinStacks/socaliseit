'use client';

/**
 * ErrorMessage component for displaying contextual errors with recovery actions
 * Supports inline action buttons (e.g., "Reconnect" for OAuth token failures)
 */

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, AlertTriangle, Info, Loader2 } from 'lucide-react';

export interface ErrorMessageAction {
    label: string;
    onClick: () => void;
    loading?: boolean;
}

export interface ErrorMessageProps {
    /** Type of message: error (red), warning (orange), info (blue) */
    type: 'error' | 'warning' | 'info';
    /** Primary message text */
    title: string;
    /** Optional secondary description */
    description?: string;
    /** Optional contextual action button */
    action?: ErrorMessageAction;
    /** Optional custom icon */
    icon?: ReactNode;
    /** Optional className for container */
    className?: string;
    /** Compact mode for inline display */
    compact?: boolean;
}

const typeConfig = {
    error: {
        icon: AlertCircle,
        containerClass: 'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400',
        iconClass: 'text-red-500',
        buttonClass: 'bg-red-500 hover:bg-red-600 text-white',
    },
    warning: {
        icon: AlertTriangle,
        containerClass: 'bg-orange-500/10 border-orange-500/20 text-orange-700 dark:text-orange-400',
        iconClass: 'text-orange-500',
        buttonClass: 'bg-orange-500 hover:bg-orange-600 text-white',
    },
    info: {
        icon: Info,
        containerClass: 'bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-400',
        iconClass: 'text-blue-500',
        buttonClass: 'bg-blue-500 hover:bg-blue-600 text-white',
    },
};

/**
 * Displays contextual error/warning/info messages with optional recovery actions.
 *
 * @example
 * // OAuth token expiring with reconnect action
 * <ErrorMessage
 *   type="warning"
 *   title="Token expiring soon"
 *   action={{
 *     label: "Reconnect",
 *     onClick: handleReconnect,
 *     loading: isReconnecting
 *   }}
 * />
 *
 * @example
 * // Failed API call with retry
 * <ErrorMessage
 *   type="error"
 *   title="Failed to load data"
 *   description="Please check your connection"
 *   action={{ label: "Retry", onClick: refetch }}
 * />
 */
export function ErrorMessage({
    type,
    title,
    description,
    action,
    icon,
    className,
    compact = false,
}: ErrorMessageProps) {
    const config = typeConfig[type];
    const Icon = config.icon;

    return (
        <div
            className={cn(
                'flex items-center gap-3 rounded-lg border backdrop-blur-sm',
                compact ? 'px-3 py-2' : 'p-4',
                config.containerClass,
                className
            )}
            role="alert"
        >
            {/* Icon */}
            <div className={cn('flex-shrink-0', config.iconClass)}>
                {icon || <Icon className={compact ? 'h-4 w-4' : 'h-5 w-5'} />}
            </div>

            {/* Message content */}
            <div className="flex-1 min-w-0">
                <p className={cn('font-medium', compact ? 'text-sm' : 'text-base')}>
                    {title}
                </p>
                {description && (
                    <p className={cn('mt-0.5 opacity-80', compact ? 'text-xs' : 'text-sm')}>
                        {description}
                    </p>
                )}
            </div>

            {/* Action button */}
            {action && (
                <button
                    onClick={action.onClick}
                    disabled={action.loading}
                    className={cn(
                        'flex-shrink-0 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium',
                        'transition-all duration-150 ease-out',
                        'active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed',
                        config.buttonClass
                    )}
                >
                    {action.loading && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    {action.label}
                </button>
            )}
        </div>
    );
}

/**
 * Compact inline variant for use within cards/lists
 */
export function InlineErrorBadge({
    type,
    label,
    action,
}: {
    type: 'error' | 'warning' | 'info';
    label: string;
    action?: ErrorMessageAction;
}) {
    const config = typeConfig[type];
    const Icon = config.icon;

    return (
        <div className="flex items-center gap-2">
            <span
                className={cn(
                    'flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
                    config.containerClass
                )}
            >
                <Icon className="h-3 w-3" />
                {label}
            </span>
            {action && (
                <button
                    onClick={action.onClick}
                    disabled={action.loading}
                    className={cn(
                        'rounded-md px-2 py-1 text-xs font-medium',
                        'transition-all duration-150 active:scale-95',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        config.buttonClass
                    )}
                >
                    {action.loading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                        action.label
                    )}
                </button>
            )}
        </div>
    );
}
