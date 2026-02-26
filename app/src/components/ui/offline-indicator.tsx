/**
 * Offline Indicator Component
 * Shows a fixed banner when the app is offline with queued item count and recovery status.
 *
 * Why: Provides clear feedback that the app is offline and actions are being queued,
 * with sync progress and recovery results.
 */

'use client';

import { useEffect, useState } from 'react';
import { WifiOff, Cloud, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPendingCount, getFailedPermanentCount } from '@/lib/offline-queue';
import { syncAll, onSyncComplete, type SyncResult } from '@/lib/sync-manager';
import { useOrganization } from '@/hooks/use-organization';

interface OfflineIndicatorProps {
    className?: string;
}

export function OfflineIndicator({ className }: OfflineIndicatorProps) {
    const [isOnline, setIsOnline] = useState(true);
    const [pendingCount, setPendingCount] = useState(0);
    const [failedCount, setFailedCount] = useState(0);
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

    // Update pending + failed counts (paused when tab is hidden to save battery)
    useEffect(() => {
        const updateCounts = async () => {
            const [pending, failed] = await Promise.all([
                getPendingCount(),
                getFailedPermanentCount(),
            ]);
            setPendingCount(pending);
            setFailedCount(failed);
        };

        updateCounts();
        let interval: ReturnType<typeof setInterval> | null = setInterval(updateCounts, 5000);

        /** Why: Stop polling IndexedDB when tab isn't visible to reduce CPU wake-ups */
        const handleVisibility = () => {
            if (document.hidden) {
                if (interval) { clearInterval(interval); interval = null; }
            } else {
                updateCounts();
                if (!interval) { interval = setInterval(updateCounts, 5000); }
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            if (interval) clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
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

    // Don't show if online, no pending items, and no results to display
    if (isOnline && pendingCount === 0 && failedCount === 0 && !lastSyncResult) {
        return null;
    }

    const hasFailures = failedCount > 0;

    return (
        <div
            className={cn(
                'fixed left-4 z-50 flex items-center gap-3',
                'rounded-xl px-4 py-2.5 shadow-lg',
                'backdrop-blur-md border transition-all duration-300',
                hasFailures
                    ? 'bg-red-500/10 border-red-500/20'
                    : isOnline
                        ? 'bg-emerald-500/10 border-emerald-500/20'
                        : 'bg-amber-500/10 border-amber-500/20',
                className
            )}
            style={{
                bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
            }}
        >
            {/* Icon */}
            {hasFailures ? (
                <AlertTriangle className="h-5 w-5 text-red-500" />
            ) : isOnline ? (
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
                <span className={cn(
                    'text-sm font-medium',
                    hasFailures
                        ? 'text-red-400'
                        : isOnline ? 'text-emerald-400' : 'text-amber-400'
                )}>
                    {hasFailures
                        ? `${failedCount} post${failedCount === 1 ? '' : 's'} failed`
                        : isOnline
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
                        {lastSyncResult.cleanedStale > 0 && `, cleaned ${lastSyncResult.cleanedStale} stale`}
                    </span>
                )}
            </div>

            {/* Sync button (when online with pending items) */}
            {isOnline && (pendingCount > 0 || hasFailures) && !isSyncing && (
                <button
                    onClick={handleSync}
                    className={cn(
                        'ml-2 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                        hasFailures
                            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                            : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                    )}
                >
                    Sync Now
                </button>
            )}
        </div>
    );
}
