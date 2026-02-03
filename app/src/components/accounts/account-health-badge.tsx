/**
 * Account Health Badge
 * Visual indicator for account connection status.
 *
 * Why: Quick visual feedback for users about account health without opening settings.
 */

'use client';

import { CheckCircle, AlertTriangle, XCircle, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AccountHealthStatus } from '@/hooks/use-account-health';
import { useTestConnection } from '@/hooks/use-account-health';
import { useState } from 'react';

interface AccountHealthBadgeProps {
    accountId: string;
    status: AccountHealthStatus;
    message?: string;
    expiresIn?: number | null;
    showTestButton?: boolean;
    className?: string;
}

const statusConfig: Record<
    AccountHealthStatus,
    { icon: typeof CheckCircle; color: string; bgColor: string; label: string }
> = {
    healthy: {
        icon: CheckCircle,
        color: 'text-emerald-500',
        bgColor: 'bg-emerald-500/10',
        label: 'Connected',
    },
    expiring: {
        icon: AlertTriangle,
        color: 'text-amber-500',
        bgColor: 'bg-amber-500/10',
        label: 'Expiring Soon',
    },
    expired: {
        icon: XCircle,
        color: 'text-red-500',
        bgColor: 'bg-red-500/10',
        label: 'Expired',
    },
    error: {
        icon: XCircle,
        color: 'text-red-500',
        bgColor: 'bg-red-500/10',
        label: 'Error',
    },
};

export function AccountHealthBadge({
    accountId,
    status,
    message,
    expiresIn,
    showTestButton = false,
    className,
}: AccountHealthBadgeProps) {
    const config = statusConfig[status];
    const Icon = config.icon;
    const [showTooltip, setShowTooltip] = useState(false);
    const testConnection = useTestConnection();

    const tooltipMessage =
        message || (expiresIn !== null ? `Expires in ${expiresIn} days` : config.label);

    return (
        <div className={cn('relative inline-flex items-center gap-2', className)}>
            {/* Badge */}
            <div
                className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                    config.bgColor,
                    config.color
                )}
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
            >
                <Icon className="h-3.5 w-3.5" />
                <span>{config.label}</span>
            </div>

            {/* Test Connection Button */}
            {showTestButton && (
                <button
                    onClick={() => testConnection.mutate(accountId)}
                    disabled={testConnection.isPending}
                    className={cn(
                        'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs',
                        'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
                        'hover:bg-[var(--bg-quaternary)] hover:text-[var(--text-primary)]',
                        'transition-colors disabled:opacity-50'
                    )}
                    title="Test Connection"
                >
                    {testConnection.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                        <RefreshCw className="h-3 w-3" />
                    )}
                    Test
                </button>
            )}

            {/* Tooltip */}
            {showTooltip && (
                <div
                    className={cn(
                        'absolute left-0 top-full z-50 mt-1',
                        'rounded-lg bg-[var(--bg-primary)] px-3 py-2 text-xs shadow-lg',
                        'border border-[var(--border)]',
                        'whitespace-nowrap'
                    )}
                >
                    {tooltipMessage}
                    {testConnection.data && (
                        <div className="mt-1 text-[var(--text-muted)]">
                            Last test: {testConnection.data.message}
                            {testConnection.data.responseTime && (
                                <span> ({testConnection.data.responseTime}ms)</span>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * Compact badge for use in lists/tables.
 */
export function AccountHealthDot({
    status,
    className,
}: {
    status: AccountHealthStatus;
    className?: string;
}) {
    const config = statusConfig[status];

    return (
        <div
            className={cn('h-2.5 w-2.5 rounded-full', className)}
            style={{
                backgroundColor:
                    status === 'healthy'
                        ? '#10b981'
                        : status === 'expiring'
                            ? '#f59e0b'
                            : '#ef4444',
            }}
            title={config.label}
        />
    );
}
