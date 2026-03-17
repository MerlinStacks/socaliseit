/**
 * Failed Posts Banner
 * Mobile-friendly banner showing offline posts that failed to publish.
 *
 * Why: Users need visibility into queued posts that couldn't sync,
 * with the ability to retry or dismiss individual failures.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPendingPosts, removePendingPost, resetPostForRetry, type PendingPost } from '@/lib/offline-queue';
import { useOfflineRecovery } from '@/lib/offline-recovery';
import { useOrganization } from '@/hooks/use-organization';
import { useOnlineStatus } from '@/lib/compose-offline';
import { triggerHaptic } from '@/hooks/use-haptic';

/**
 * Renders a banner when there are failed offline posts.
 * Expandable to show individual post errors with retry/dismiss actions.
 */
export function FailedPostsBanner() {
    const { organization } = useOrganization();
    const isOnline = useOnlineStatus();
    const {
        pendingCount,
        failedPermanentCount,
        isRecovering,
        triggerRecovery,
        retryAllFailed,
    } = useOfflineRecovery({
        organizationId: organization?.id,
        isOnline,
    });

    const [isExpanded, setIsExpanded] = useState(false);
    const [failedPosts, setFailedPosts] = useState<PendingPost[]>([]);
    const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

    const totalIssues = pendingCount + failedPermanentCount;

    /** Why: Load individual failed posts for the expanded detail view */
    const loadFailedPosts = useCallback(async () => {
        if (!organization?.id) return;
        const posts = await getPendingPosts(organization.id);
        setFailedPosts(posts.filter((p) => !dismissedIds.has(p.id)));
    }, [organization?.id, dismissedIds]);

    useEffect(() => {
        if (isExpanded) {
            loadFailedPosts();
        }
    }, [isExpanded, loadFailedPosts, pendingCount, failedPermanentCount]);

    const handleDismiss = useCallback(async (postId: string) => {
        triggerHaptic('light');
        await removePendingPost(postId);
        setDismissedIds((prev) => new Set(prev).add(postId));
        setFailedPosts((prev) => prev.filter((p) => p.id !== postId));
    }, []);

    const handleRetryOne = useCallback(async (postId: string) => {
        triggerHaptic('medium');
        await resetPostForRetry(postId);
        await triggerRecovery();
    }, [triggerRecovery]);

    const handleRetryAll = useCallback(async () => {
        triggerHaptic('medium');
        await retryAllFailed();
    }, [retryAllFailed]);

    // Don't render if nothing to show
    if (totalIssues === 0 && failedPosts.length === 0) return null;

    return (
        <div
            className={cn(
                'mx-4 mb-3 overflow-hidden rounded-xl border',
                'backdrop-blur-md transition-all duration-300',
                failedPermanentCount > 0
                    ? 'border-red-500/20 bg-red-500/5'
                    : 'border-amber-500/20 bg-amber-500/5'
            )}
        >
            {/* Header */}
            <button
                onClick={() => {
                    triggerHaptic('light');
                    setIsExpanded((prev) => !prev);
                }}
                className="flex w-full items-center justify-between px-4 py-3"
            >
                <div className="flex items-center gap-3">
                    <div
                        className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-full',
                            failedPermanentCount > 0
                                ? 'bg-red-500/20'
                                : 'bg-amber-500/20'
                        )}
                    >
                        {isRecovering ? (
                            <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                        ) : (
                            <AlertTriangle
                                className={cn(
                                    'h-4 w-4',
                                    failedPermanentCount > 0 ? 'text-red-500' : 'text-amber-500'
                                )}
                            />
                        )}
                    </div>
                    <div className="text-left">
                        <p className={cn(
                            'text-sm font-medium',
                            failedPermanentCount > 0 ? 'text-red-400' : 'text-amber-400'
                        )}>
                            {isRecovering
                                ? 'Retrying posts...'
                                : failedPermanentCount > 0
                                    ? `${failedPermanentCount} post${failedPermanentCount === 1 ? '' : 's'} failed`
                                    : `${pendingCount} post${pendingCount === 1 ? '' : 's'} queued`}
                        </p>
                        {!isRecovering && pendingCount > 0 && failedPermanentCount === 0 && (
                            <p className="text-xs text-[var(--text-muted)]">
                                Will retry automatically when online
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Retry All button */}
                    {isOnline && (failedPermanentCount > 0 || pendingCount > 0) && !isRecovering && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleRetryAll();
                            }}
                            className={cn(
                                'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                                failedPermanentCount > 0
                                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                                    : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                            )}
                        >
                            <RefreshCw className="mr-1 inline h-3 w-3" />
                            Retry All
                        </button>
                    )}
                    {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-[var(--text-muted)]" />
                    ) : (
                        <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                    )}
                </div>
            </button>

            {/* Expanded Details */}
            {isExpanded && failedPosts.length > 0 && (
                <div className="border-t border-[var(--border)]/50 px-4 py-2">
                    <div className="max-h-48 space-y-2 overflow-y-auto">
                        {failedPosts.map((post) => (
                            <div
                                key={post.id}
                                className="flex items-start justify-between gap-2 rounded-lg bg-[var(--bg-secondary)]/50 p-2.5"
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="truncate text-sm text-[var(--text-primary)]">
                                        {post.caption.slice(0, 60) || 'No caption'}
                                        {post.caption.length > 60 ? '...' : ''}
                                    </p>
                                    {post.lastError && (
                                        <p className="mt-0.5 text-xs text-red-400">
                                            {post.lastError}
                                        </p>
                                    )}
                                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                                        {post.status === 'failed_permanent'
                                            ? `Failed after ${post.retryCount} retries`
                                            : `Retry ${post.retryCount}/5`}
                                        {' · '}
                                        {format(new Date(post.createdAt), 'MMM d, hh:mm a')}
                                    </p>
                                </div>

                                <div className="flex shrink-0 items-center gap-1">
                                    {isOnline && (
                                        <button
                                            onClick={() => handleRetryOne(post.id)}
                                            className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-emerald-400"
                                            title="Retry"
                                        >
                                            <RefreshCw className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleDismiss(post.id)}
                                        className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-red-400"
                                        title="Dismiss"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
