/**
 * Token Expiry Banner
 * Dashboard warning when accounts are expiring or expired.
 *
 * Why: Proactive notification prevents publishing failures from expired tokens.
 */

'use client';

import { AlertTriangle, X, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useAccountHealth } from '@/hooks/use-account-health';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface TokenExpiryBannerProps {
    className?: string;
}

export function TokenExpiryBanner({ className }: TokenExpiryBannerProps) {
    const { expiringAccounts, expiredAccounts, hasIssues, isLoading } = useAccountHealth();
    const [isDismissed, setIsDismissed] = useState(false);

    // Don't render if no issues or dismissed
    if (isLoading || !hasIssues || isDismissed) {
        return null;
    }

    const expiredCount = expiredAccounts.length;
    const expiringCount = expiringAccounts.length;
    const isUrgent = expiredCount > 0;

    // Build message
    let message = '';
    if (expiredCount > 0 && expiringCount > 0) {
        message = `${expiredCount} account${expiredCount === 1 ? ' has' : 's have'} expired and ${expiringCount} ${expiringCount === 1 ? 'is' : 'are'} expiring soon`;
    } else if (expiredCount > 0) {
        message = `${expiredCount} account${expiredCount === 1 ? ' has' : 's have'} expired`;
    } else {
        message = `${expiringCount} account${expiringCount === 1 ? ' is' : 's are'} expiring soon`;
    }

    return (
        <div
            className={cn(
                'relative flex items-center gap-3 rounded-xl px-4 py-3',
                isUrgent
                    ? 'bg-red-500/10 border border-red-500/20'
                    : 'bg-amber-500/10 border border-amber-500/20',
                className
            )}
        >
            <AlertTriangle
                className={cn('h-5 w-5 flex-shrink-0', isUrgent ? 'text-red-500' : 'text-amber-500')}
            />

            <div className="flex-1">
                <p
                    className={cn(
                        'text-sm font-medium',
                        isUrgent ? 'text-red-400' : 'text-amber-400'
                    )}
                >
                    {message}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    Reconnect to avoid publishing interruptions
                </p>
            </div>

            <Link
                href="/settings?tab=accounts"
                className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium',
                    'bg-[var(--bg-tertiary)] text-[var(--text-primary)]',
                    'hover:bg-[var(--bg-quaternary)] transition-colors'
                )}
            >
                <RefreshCw className="h-4 w-4" />
                Reconnect
            </Link>

            <button
                onClick={() => setIsDismissed(true)}
                className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                title="Dismiss for now"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}
