/**
 * Offline Indicator Component
 * Shows a fixed banner when the app is offline with queued item count.
 *
 * Why: Provides clear feedback that the app is offline and actions are being queued.
 */

'use client';

import { useEffect, useState } from 'react';
import { WifiOff, Cloud, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPendingCount } from '@/lib/offline-queue';
import { syncAll, onSyncComplete, type SyncResult } from '@/lib/sync-manager';
import { useOrganization } from '@/hooks/use-organization';

interface OfflineIndicatorProps {
    className?: string;
}

export function OfflineIndicator({ className }: OfflineIndicatorProps) {
    const [isOnline, setIsOnline] = useState(true);
    const [pendingCount, setPendingCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
    const { organization } = useOrganization();

    // Track online/offline status
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const updateOnlineStatus = () => {
            setIsOnline(navigator.onLine);
        };

        setIsOnline(navigator.onLine);
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);

        return () => {
            window.removeEventListener('online', updateOnlineStatus);
            window.removeEventListener('offline', updateOnlineStatus);
        };
    }, []);

    // Update pending count
    useEffect(() => {
        const updateCount = async () => {
            const count = await getPendingCount();
            setPendingCount(count);
        };

        updateCount();
        const interval = setInterval(updateCount, 5000); // Check every 5 seconds

        return () => clearInterval(interval);
    }, []);

    // Auto-sync when coming back online
    useEffect(() => {
        if (isOnline && pendingCount > 0 && organization?.id) {
            handleSync();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnline]);

    // Subscribe to sync events
    useEffect(() => {
        return onSyncComplete((result) => {
            setIsSyncing(false);
            setLastSyncResult(result);
            // Clear result after 5 seconds
            setTimeout(() => setLastSyncResult(null), 5000);
        });
    }, []);

    const handleSync = async () => {
        if (!organization?.id || isSyncing) return;

        setIsSyncing(true);
        await syncAll(organization.id);
    };

    // Don't show if online and no pending items
    if (isOnline && pendingCount === 0 && !lastSyncResult) {
        return null;
    }

    return (
        <div
            className={cn(
                'fixed left-4 z-50 flex items-center gap-3',
                'rounded-xl px-4 py-2.5 shadow-lg',
                'backdrop-blur-md border',
                isOnline
                    ? 'bg-emerald-500/10 border-emerald-500/20'
                    : 'bg-amber-500/10 border-amber-500/20',
                className
            )}
            style={{
                bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
            }}
        >
            {/* Icon */}
            {isOnline ? (
                isSyncing ? (
                    <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
                ) : (
                    <Cloud className="h-5 w-5 text-emerald-500" />
                )
            ) : (
                <WifiOff className="h-5 w-5 text-amber-500" />
            )}

            {/* Message */}
            <div className="flex flex-col">
                <span className={cn('text-sm font-medium', isOnline ? 'text-emerald-400' : 'text-amber-400')}>
                    {isOnline
                        ? isSyncing
                            ? 'Syncing...'
                            : lastSyncResult
                                ? lastSyncResult.status === 'success'
                                    ? 'Synced successfully'
                                    : `Sync completed with ${lastSyncResult.failedItems} errors`
                                : 'Online'
                        : "You're offline"}
                </span>

                {!isOnline && pendingCount > 0 && (
                    <span className="text-xs text-[var(--text-muted)]">
                        {pendingCount} item{pendingCount === 1 ? '' : 's'} queued for sync
                    </span>
                )}

                {lastSyncResult && lastSyncResult.syncedPosts > 0 && (
                    <span className="text-xs text-[var(--text-muted)]">
                        Synced {lastSyncResult.syncedPosts} post{lastSyncResult.syncedPosts === 1 ? '' : 's'}
                    </span>
                )}
            </div>

            {/* Sync button (when online with pending items) */}
            {isOnline && pendingCount > 0 && !isSyncing && (
                <button
                    onClick={handleSync}
                    className={cn(
                        'ml-2 rounded-lg px-2.5 py-1 text-xs font-medium',
                        'bg-emerald-500/20 text-emerald-400',
                        'hover:bg-emerald-500/30 transition-colors'
                    )}
                >
                    Sync Now
                </button>
            )}
        </div>
    );
}
