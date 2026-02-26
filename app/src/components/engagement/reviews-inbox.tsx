'use client';

/**
 * Reviews Inbox Component
 *
 * Why: Displays Google Business Profile and Facebook Page reviews in a
 * unified list with star ratings, reply input, and AI-assisted suggestions.
 * Follows the same patterns as comments-inbox and mentions-feed components.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
    Star,
    Send,
    Sparkles,
    RefreshCw,
    MessageSquare,
    Check,
    MailX,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { PlatformIcon } from '@/components/compose/profile-selector';
import type { Platform } from '@/lib/platform-config';
import { showErrorToast } from '@/lib/api-error';

// ============================================================================
// Types
// ============================================================================

interface ReviewItem {
    id: string;
    platformReviewId: string;
    authorName: string;
    authorAvatar: string | null;
    rating: number;
    text: string | null;
    replyText: string | null;
    isReplied: boolean;
    isRead: boolean;
    platform: string;
    reviewUrl: string | null;
    createdAt: string;
    socialAccount: {
        platform: string;
        name: string;
        avatar: string | null;
    };
}

// ============================================================================
// Sub-components
// ============================================================================

/** Renders 1-5 filled/empty stars */
function StarRating({ rating }: { rating: number }) {
    return (
        <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
                <Star
                    key={i}
                    className={cn(
                        'h-3.5 w-3.5',
                        i <= rating
                            ? 'fill-current'
                            : '',
                    )}
                    style={{
                        color: i <= rating ? 'var(--accent-gold)' : 'var(--text-muted)',
                        opacity: i <= rating ? 1 : 0.3,
                    }}
                />
            ))}
        </div>
    );
}

/** AI reply suggestions — reuses /api/ai/generate-reply */
function ReviewAiSuggestions({
    reviewText,
    rating,
    platform,
    onSelect,
    disabled,
}: {
    reviewText: string;
    rating: number;
    platform: string;
    onSelect: (text: string) => void;
    disabled: boolean;
}) {
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [isFetching, setIsFetching] = useState(false);

    const fetchSuggestions = async () => {
        setIsFetching(true);
        try {
            const sentiment =
                rating >= 4 ? 'positive' : rating <= 2 ? 'negative' : 'neutral';
            const normalizedPlatform = platform.toLowerCase().replace(/ /g, '_');
            const res = await fetch('/api/ai/generate-reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messageText: reviewText || `${rating}-star review with no text`,
                    messageType: 'review',
                    platform: normalizedPlatform,
                    sentiment,
                    rating,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                setSuggestions(data.data?.suggestions || []);
            }
        } catch (err) {
            showErrorToast(err, 'Failed to fetch AI suggestions');
        } finally {
            setIsFetching(false);
        }
    };

    if (suggestions.length === 0 && !isFetching) {
        return (
            <Button
                variant="ghost"
                size="sm"
                onClick={fetchSuggestions}
                disabled={disabled || isFetching}
                className="gap-2 mt-2"
                style={{ color: 'var(--accent-gold)' }}
            >
                <Sparkles className="h-3.5 w-3.5" />
                AI reply suggestions
            </Button>
        );
    }

    return (
        <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--accent-gold)' }}>
                <Sparkles className="h-3 w-3" />
                <span className="font-medium">AI Suggestions</span>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 ml-auto interactive-scale"
                    onClick={fetchSuggestions}
                    disabled={isFetching}
                >
                    <RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} />
                </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {isFetching ? (
                    <>
                        <Skeleton className="h-7 w-32 rounded-full" />
                        <Skeleton className="h-7 w-40 rounded-full" />
                    </>
                ) : (
                    suggestions.map((s, i) => (
                        <button
                            key={i}
                            onClick={() => onSelect(s)}
                            className="px-3 py-1 text-xs rounded-full border transition-all duration-200 text-left max-w-[240px] truncate hover:shadow-sm"
                            style={{
                                background: 'var(--bg-secondary)',
                                borderColor: 'var(--border)',
                                color: 'var(--text-primary)',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-gold)'}
                            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                            title={s}
                        >
                            {s.slice(0, 60)}{s.length > 60 ? '…' : ''}
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}

/** Single review card — glassmorphism container, full text, inline reply */
function ReviewCard({
    review,
    onReply,
    isReplying,
}: {
    review: ReviewItem;
    onReply: (reviewId: string, text: string) => void;
    isReplying: boolean;
}) {
    const [replyText, setReplyText] = useState('');
    const [showReplyInput, setShowReplyInput] = useState(false);

    const handleSubmit = () => {
        if (!replyText.trim()) return;
        onReply(review.id, replyText);
        setReplyText('');
        setShowReplyInput(false);
    };

    return (
        <div
            className={cn(
                'glass-card card-hover p-4 transition-all duration-200',
                !review.isRead && 'ring-2',
            )}
            style={{
                // @ts-expect-error CSS custom property for ring colour
                '--tw-ring-color': !review.isRead ? 'var(--accent-gold)' : undefined,
                background: !review.isRead ? 'var(--accent-gold-light)' : undefined,
            }}
        >
            {/* Header */}
            <div className="flex items-start gap-3">
                <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={review.authorAvatar || undefined} />
                    <AvatarFallback colorSeed={review.authorName}>
                        {review.authorName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">
                            {review.authorName}
                        </span>
                        <PlatformIcon
                            platform={review.platform as Platform}
                            size={14}
                        />
                        <span className="text-xs ml-auto shrink-0" style={{ color: 'var(--text-muted)' }}>
                            {formatDistanceToNow(new Date(review.createdAt), {
                                addSuffix: true,
                            })}
                        </span>
                    </div>

                    <StarRating rating={review.rating} />
                </div>
            </div>

            {/* Review text — shown in full, no truncation */}
            {review.text && (
                <p className="mt-3 text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {review.text}
                </p>
            )}

            {/* Existing reply */}
            {review.isReplied && review.replyText && (
                <div className="mt-3 pl-3 py-2 rounded-md" style={{ borderLeft: '2px solid var(--accent-gold)', background: 'var(--bg-tertiary)' }}>
                    <div className="flex items-center gap-1.5 text-xs mb-0.5" style={{ color: 'var(--success)' }}>
                        <Check className="h-3 w-3" />
                        Your reply
                    </div>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {review.replyText}
                    </p>
                </div>
            )}

            {/* Reply section */}
            {!review.isReplied && (
                <>
                    {showReplyInput ? (
                        <div className="mt-3 space-y-2">
                            <textarea
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                placeholder="Write your reply…"
                                className="w-full min-h-[60px] max-h-[120px] px-3 py-2 text-sm rounded-lg border resize-none focus:outline-none focus:ring-2"
                                style={{
                                    background: 'var(--bg-secondary)',
                                    borderColor: 'var(--border)',
                                    // @ts-expect-error CSS custom property
                                    '--tw-ring-color': 'var(--accent-gold)',
                                }}
                                rows={2}
                            />
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleSubmit}
                                    disabled={!replyText.trim() || isReplying}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-gradient text-white transition-all duration-200 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed btn-interactive"
                                >
                                    <Send className="h-3.5 w-3.5" />
                                    {isReplying ? 'Sending…' : 'Send Reply'}
                                </button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setShowReplyInput(false);
                                        setReplyText('');
                                    }}
                                >
                                    Cancel
                                </Button>
                            </div>
                            <ReviewAiSuggestions
                                reviewText={review.text || ''}
                                rating={review.rating}
                                platform={review.platform}
                                onSelect={setReplyText}
                                disabled={isReplying}
                            />
                        </div>
                    ) : (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowReplyInput(true)}
                            className="gap-1.5 mt-3 interactive-scale"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            <MessageSquare className="h-3.5 w-3.5" />
                            Reply
                        </Button>
                    )}
                </>
            )}

            {/* Account badge */}
            <div className="mt-3 pt-3 flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-light)' }}>
                <Avatar className="h-4 w-4">
                    <AvatarImage src={review.socialAccount.avatar || undefined} />
                    <AvatarFallback className="text-[8px]" colorSeed={review.socialAccount.name}>
                        {review.socialAccount.name.charAt(0)}
                    </AvatarFallback>
                </Avatar>
                {review.socialAccount.name}
            </div>
        </div>
    );
}

/** Loading skeleton matching the new card layout */
function ReviewSkeleton() {
    return (
        <div className="glass-card p-4 space-y-3">
            <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-20" />
                </div>
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
        </div>
    );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * Reviews Inbox — lists reviews with filtering, reply, and AI suggestions
 */
export function ReviewsInbox() {
    const queryClient = useQueryClient();
    const [platformFilter, setPlatformFilter] = useState<string | null>(null);
    const [repliedFilter, setRepliedFilter] = useState<string>('all');

    /**
     * Why: Platform-made replies (e.g. owner replies posted directly on Google)
     * only enter the local DB via sync. Fire a non-blocking sync on mount so
     * the user sees fresh reply data without manually clicking "Sync All".
     */
    const syncOnce = useRef(false);
    useEffect(() => {
        if (!syncOnce.current) {
            syncOnce.current = true;
            fetch('/api/reviews/sync', { method: 'POST' })
                .then(() => queryClient.invalidateQueries({ queryKey: ['reviews'] }))
                .catch(() => {
                    // Why: Silent failure — stale cached data is still shown
                });
        }
    }, [queryClient]);

    const buildParams = useCallback(() => {
        const params = new URLSearchParams();
        if (platformFilter) params.set('platform', platformFilter);
        if (repliedFilter !== 'all') params.set('repliedStatus', repliedFilter);
        return params.toString();
    }, [platformFilter, repliedFilter]);

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['reviews', platformFilter, repliedFilter],
        queryFn: async () => {
            const qs = buildParams();
            const res = await fetch(`/api/reviews${qs ? `?${qs}` : ''}`);
            if (!res.ok) throw new Error('Failed to fetch reviews');
            return res.json() as Promise<{
                data: { reviews: ReviewItem[]; hasMore: boolean };
            }>;
        },
        staleTime: 30 * 1000, // 30 seconds
        refetchInterval: 60 * 1000, // Auto-refresh every minute
        refetchIntervalInBackground: false,
    });

    const replyMutation = useMutation({
        mutationFn: async ({ reviewId, text }: { reviewId: string; text: string }) => {
            const res = await fetch('/api/reviews/reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reviewId, text }),
            });
            if (!res.ok) {
                const err = await res.json();
                // Why: Attach HTTP status so onError can differentiate 404
                // (review deleted upstream) from real failures
                const error = new Error(err.error || 'Failed to send reply');
                (error as Error & { status?: number }).status = res.status;
                throw error;
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['reviews'] });
            toast('success', 'Reply posted successfully!');
        },
        onError: (err) => {
            const status = (err as Error & { status?: number }).status;
            if (status === 404) {
                // Why: Server already deleted the stale review — evict it
                // from the cache so the card disappears without a full refresh
                queryClient.invalidateQueries({ queryKey: ['reviews'] });
                toast('error', err.message || 'This review no longer exists.');
            } else {
                toast('error', err instanceof Error ? err.message : 'Failed to send reply');
            }
        },
    });

    const reviews = data?.data?.reviews || [];

    /** Why: Pill-style helper avoids repeating the same button boilerplate */
    const pillClass = (active: boolean) =>
        cn(
            'px-3 py-1.5 text-xs font-medium rounded-full border transition-all duration-200 whitespace-nowrap touch-target-sm',
            active
                ? 'bg-gradient text-white border-transparent shadow-sm'
                : 'hover:shadow-sm',
        );

    return (
        <div className="space-y-4">
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

                {/* Unreplied Only toggle — accent-coloured when active */}
                <button
                    onClick={() =>
                        setRepliedFilter((prev) => (prev === 'unreplied' ? 'all' : 'unreplied'))
                    }
                    className={cn(
                        'px-3 py-1.5 text-xs font-medium rounded-full border transition-all duration-200 whitespace-nowrap touch-target-sm inline-flex items-center gap-1.5',
                        repliedFilter === 'unreplied'
                            ? 'text-white border-transparent shadow-sm'
                            : 'hover:shadow-sm',
                    )}
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

                {/* Refresh */}
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 ml-auto interactive-scale"
                    onClick={() => refetch()}
                    disabled={isLoading}
                >
                    <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
                </Button>
            </div>

            {/* Review card grid — 1 col mobile, 2 col desktop */}
            <div className="max-h-[calc(100vh-340px)] md:max-h-[calc(100vh-300px)] overflow-y-auto pr-1">
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                        {reviews.map((review) => (
                            <ReviewCard
                                key={review.id}
                                review={review}
                                onReply={(reviewId, text) =>
                                    replyMutation.mutate({ reviewId, text })
                                }
                                isReplying={replyMutation.isPending}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
