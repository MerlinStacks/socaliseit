'use client';

/**
 * Reviews Inbox Component
 *
 * Why: Displays Google Business Profile and Facebook Page reviews in a
 * unified list with star ratings, reply input, and AI-assisted suggestions.
 * Follows the same patterns as comments-inbox and mentions-feed components.
 *
 * Improvements:
 * - #3:  Sync-on-mount checks res.ok before invalidating queries
 * - #5:  Uses useInfiniteQuery with cursor-based pagination
 * - #6:  Flex container with calc-based max-height as fallback
 * - #7:  Uses apiFetch instead of raw fetch (reply mutation)
 * - #9:  Unified pillClass with color variant for "Unreplied Only"
 * - #12: Refresh button has aria-label
 * - #16: Reply text cleared via onSuccess callback, not in handleSubmit
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Star,
    RefreshCw,
    MailX,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-error';
import { ReviewCard } from './review-card';
import type { ReviewItem } from './review-card';
import { ReviewSkeleton } from './review-skeleton';

// ============================================================================
// Types
// ============================================================================

interface ReviewsPage {
    data: {
        reviews: ReviewItem[];
        nextCursor: string | null;
        hasMore: boolean;
    };
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * Reviews Inbox — lists reviews with filtering, cursor-based pagination,
 * reply, and AI suggestions.
 */
export function ReviewsInbox() {
    const queryClient = useQueryClient();
    const [platformFilter, setPlatformFilter] = useState<string | null>(null);
    const [repliedFilter, setRepliedFilter] = useState<string>('all');
    const markedAllRead = useRef(false);

    /**
     * Why: Platform-made replies (e.g. owner replies posted directly on Google)
     * only enter the local DB via sync. Fire a non-blocking sync on mount so
     * the user sees fresh reply data without manually clicking "Sync All".
     *
     * #3: Now checks res.ok before invalidating to avoid thrashing the cache
     * on a failed sync.
     */
    const syncOnce = useRef(false);
    useEffect(() => {
        if (!syncOnce.current) {
            syncOnce.current = true;
            apiFetch('/api/reviews/sync', { method: 'POST' })
                .then(() => {
                    queryClient.invalidateQueries({ queryKey: ['reviews'] });
                })
                .catch(() => {
                    // Why: Silent failure — stale cached data is still shown
                });
        }
    }, [queryClient]);

    /**
     * Why (#5): useInfiniteQuery with cursor pagination — only fetches the next
     * page instead of re-fetching the entire list when loading more.
     */
    const buildParams = useCallback(
        (cursor?: string) => {
            const params = new URLSearchParams();
            if (platformFilter) params.set('platform', platformFilter);
            if (repliedFilter !== 'all') params.set('repliedStatus', repliedFilter);
            params.set('limit', '20');
            if (cursor) params.set('cursor', cursor);
            return params.toString();
        },
        [platformFilter, repliedFilter],
    );

    const {
        data,
        isLoading,
        refetch,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useInfiniteQuery<ReviewsPage>({
        queryKey: ['reviews', platformFilter, repliedFilter],
        queryFn: async ({ pageParam }) => {
            const qs = buildParams(pageParam as string | undefined);
            return apiFetch<ReviewsPage>(
                `/api/reviews${qs ? `?${qs}` : ''}`,
                undefined,
                'Failed to fetch reviews',
            );
        },
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (lastPage) => lastPage.data.nextCursor ?? undefined,
        staleTime: 30 * 1000,
        refetchInterval: 60 * 1000,
        refetchIntervalInBackground: false,
    });


    const replyMutation = useMutation({
        mutationFn: async ({ reviewId, text }: { reviewId: string; text: string }) =>
            apiFetch('/api/reviews/reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reviewId, text }),
            }, 'Failed to send reply'),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['reviews'] });
            toast('success', 'Reply posted successfully!');
        },
        onError: (err) => {
            toast('error', err instanceof Error ? err.message : 'Failed to send reply');
        },
    });

    // Flatten pages into a single reviews array
    const reviews = data?.pages.flatMap((page) => page.data.reviews) || [];

    useEffect(() => {
        if (markedAllRead.current || reviews.length === 0) return;
        markedAllRead.current = true;

        apiFetch('/api/reviews', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ markAllRead: true }),
        })
            .then(() => {
                queryClient.invalidateQueries({ queryKey: ['unread-counts'] });
            })
            .catch(() => {
                // Why: Reading reviews should not block the inbox if the badge update fails.
            });
    }, [queryClient, reviews]);

    /**
     * Why (#9): Unified pill styling — accepts an optional color variant so
     * both platform pills and the "Unreplied Only" pill share the same helper.
     */
    const pillClass = (active: boolean, variant: 'gradient' | 'accent' = 'gradient') =>
        cn(
            'px-3 py-1.5 text-xs font-medium rounded-full border transition-all duration-200 whitespace-nowrap touch-target-sm inline-flex items-center gap-1.5',
            active
                ? variant === 'accent'
                    ? 'text-white border-transparent shadow-sm'
                    : 'bg-gradient text-white border-transparent shadow-sm'
                : 'hover:shadow-sm',
        );

    return (
        <div className="flex flex-col gap-4">
            {/* Quick-filter pills */}
            <div className="flex items-center gap-2 flex-wrap">
                {/* Platform pills */}
                {[
                    { label: 'All', value: null },
                    { label: 'Google', value: 'GOOGLE_BUSINESS' },
                    { label: 'Facebook', value: 'FACEBOOK' },
                ].map(({ label, value }) => (
                    <button
                        key={label}
                        onClick={() => setPlatformFilter(value)}
                        className={pillClass(platformFilter === value)}
                        style={platformFilter !== value ? {
                            background: 'var(--bg-secondary)',
                            borderColor: 'var(--border)',
                            color: 'var(--text-secondary)',
                        } : undefined}
                    >
                        {label}
                    </button>
                ))}

                {/* Separator dot */}
                <span className="hidden md:inline h-1 w-1 rounded-full" style={{ background: 'var(--border)' }} />

                {/* Unreplied Only toggle — accent-coloured when active (#9) */}
                <button
                    onClick={() => {
                        setRepliedFilter((prev) => (prev === 'unreplied' ? 'all' : 'unreplied'));
                    }}
                    className={pillClass(repliedFilter === 'unreplied', 'accent')}
                    style={
                        repliedFilter === 'unreplied'
                            ? { background: 'var(--accent-gold)' }
                            : {
                                background: 'var(--bg-secondary)',
                                borderColor: 'var(--border)',
                                color: 'var(--text-secondary)',
                            }
                    }
                >
                    <MailX className="h-3.5 w-3.5" />
                    Unreplied Only
                </button>

                {/* Refresh (#12: aria-label added) */}
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 ml-auto interactive-scale"
                    onClick={() => refetch()}
                    disabled={isLoading}
                    aria-label="Refresh reviews"
                >
                    <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
                </Button>
            </div>

            {/* Review card grid — 1 col mobile, 2 col desktop (#6: flex layout) */}
            <div className="flex-1 overflow-y-auto pr-1" style={{ maxHeight: 'calc(100vh - 340px)' }}>
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                        <ReviewSkeleton />
                        <ReviewSkeleton />
                        <ReviewSkeleton />
                        <ReviewSkeleton />
                    </div>
                ) : reviews.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12">
                        <div className="rounded-full p-4 mb-3" style={{ background: 'var(--accent-gold-light)' }}>
                            <Star className="h-10 w-10" style={{ color: 'var(--accent-gold)', opacity: 0.7 }} />
                        </div>
                        <p className="text-sm font-medium">No reviews found</p>
                        <p className="text-xs mt-1 text-center" style={{ color: 'var(--text-muted)' }}>
                            {repliedFilter === 'unreplied'
                                ? 'All reviews have been replied to. Nice work!'
                                : 'Connect a Google Business or Facebook Page and sync to see reviews.'}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                            {reviews.map((review) => (
                                <ReviewCard
                                    key={review.id}
                                    review={review}
                                    onReply={(reviewId, text) =>
                                        replyMutation.mutate({ reviewId, text })
                                    }
                                    isReplying={replyMutation.isPending && replyMutation.variables?.reviewId === review.id}
                                    onReplySuccess={() => {
                                        queryClient.invalidateQueries({ queryKey: ['reviews'] });
                                    }}
                                />
                            ))}
                        </div>
                        {hasNextPage && (
                            <div className="flex justify-center mt-4">
                                <button
                                    onClick={() => fetchNextPage()}
                                    disabled={isFetchingNextPage}
                                    className="px-4 py-2 text-sm font-medium rounded-full border transition-all duration-200 hover:shadow-sm interactive-scale disabled:opacity-50"
                                    style={{
                                        background: 'var(--bg-secondary)',
                                        borderColor: 'var(--border)',
                                        color: 'var(--text-secondary)',
                                    }}
                                >
                                    {isFetchingNextPage ? 'Loading…' : 'Load More Reviews'}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
