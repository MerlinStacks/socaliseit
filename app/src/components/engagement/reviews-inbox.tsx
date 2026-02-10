'use client';

/**
 * Reviews Inbox Component
 *
 * Why: Displays Google Business Profile and Facebook Page reviews in a
 * unified list with star ratings, reply input, and AI-assisted suggestions.
 * Follows the same patterns as comments-inbox and mentions-feed components.
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
    Star,
    Send,
    Sparkles,
    RefreshCw,
    MessageSquare,
    Check,
    Filter,
    ChevronDown,
    ChevronUp,
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
                            ? 'fill-yellow-400 text-yellow-400'
                            : 'text-muted-foreground/30',
                    )}
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
            const res = await fetch('/api/ai/generate-reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messageText: reviewText || `${rating}-star review with no text`,
                    messageType: 'review',
                    platform: platform === 'GOOGLE_BUSINESS' ? 'google_business' : 'facebook',
                    sentiment,
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
                className="gap-2 text-muted-foreground mt-2"
            >
                <Sparkles className="h-3.5 w-3.5" />
                AI reply suggestions
            </Button>
        );
    }

    return (
        <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3 w-3" />
                AI Suggestions
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 ml-auto"
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
                            className="px-3 py-1 text-xs rounded-full bg-background border hover:bg-accent hover:border-primary/50 transition-colors text-left max-w-[240px] truncate"
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

/** Single review card with inline reply */
function ReviewCard({
    review,
    onReply,
    isReplying,
}: {
    review: ReviewItem;
    onReply: (reviewId: string, text: string) => void;
    isReplying: boolean;
}) {
    const [expanded, setExpanded] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [showReplyInput, setShowReplyInput] = useState(false);

    const handleSubmit = () => {
        if (!replyText.trim()) return;
        onReply(review.id, replyText);
        setReplyText('');
        setShowReplyInput(false);
    };

    const truncateLength = 180;
    const isLong = (review.text?.length || 0) > truncateLength;

    return (
        <div
            className={cn(
                'p-4 border-b last:border-b-0 transition-colors',
                !review.isRead && 'bg-primary/5',
            )}
        >
            {/* Header row */}
            <div className="flex items-start gap-3">
                <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={review.authorAvatar || undefined} />
                    <AvatarFallback>
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
                        <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(review.createdAt), {
                                addSuffix: true,
                            })}
                        </span>
                    </div>

                    <StarRating rating={review.rating} />

                    {/* Review text */}
                    {review.text && (
                        <div className="mt-1.5">
                            <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                                {isLong && !expanded
                                    ? `${review.text.slice(0, truncateLength)}…`
                                    : review.text}
                            </p>
                            {isLong && (
                                <button
                                    onClick={() => setExpanded(!expanded)}
                                    className="text-xs text-primary hover:underline mt-0.5 inline-flex items-center gap-0.5"
                                >
                                    {expanded ? (
                                        <>Show less <ChevronUp className="h-3 w-3" /></>
                                    ) : (
                                        <>Show more <ChevronDown className="h-3 w-3" /></>
                                    )}
                                </button>
                            )}
                        </div>
                    )}

                    {/* Existing reply */}
                    {review.isReplied && review.replyText && (
                        <div className="mt-2 pl-3 border-l-2 border-primary/30">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
                                <Check className="h-3 w-3 text-green-500" />
                                Your reply
                            </div>
                            <p className="text-xs text-foreground/80">
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
                                        className="w-full min-h-[60px] max-h-[120px] px-3 py-2 text-sm rounded-lg border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                                        rows={2}
                                    />
                                    <div className="flex items-center gap-2">
                                        <Button
                                            size="sm"
                                            onClick={handleSubmit}
                                            disabled={!replyText.trim() || isReplying}
                                            className="gap-1.5"
                                        >
                                            <Send className="h-3.5 w-3.5" />
                                            {isReplying ? 'Sending…' : 'Send Reply'}
                                        </Button>
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
                                    className="gap-1.5 mt-2 text-muted-foreground"
                                >
                                    <MessageSquare className="h-3.5 w-3.5" />
                                    Reply
                                </Button>
                            )}
                        </>
                    )}

                    {/* Account badge */}
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Avatar className="h-4 w-4">
                            <AvatarImage src={review.socialAccount.avatar || undefined} />
                            <AvatarFallback className="text-[8px]">
                                {review.socialAccount.name.charAt(0)}
                            </AvatarFallback>
                        </Avatar>
                        {review.socialAccount.name}
                    </div>
                </div>
            </div>
        </div>
    );
}

/** Loading skeleton for reviews */
function ReviewSkeleton() {
    return (
        <div className="p-4 border-b space-y-2">
            <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-20" />
                </div>
            </div>
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
        staleTime: 30 * 1000,
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
                throw new Error(err.error || 'Failed to send reply');
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['reviews'] });
            toast('success', 'Reply posted successfully!');
        },
        onError: (err) => {
            toast('error', err instanceof Error ? err.message : 'Failed to send reply');
        },
    });

    const reviews = data?.data?.reviews || [];

    return (
        <div>
            {/* Filters */}
            <div className="flex items-center gap-2 p-3 border-b bg-muted/30 flex-wrap">
                <Filter className="h-4 w-4 text-muted-foreground" />

                <select
                    value={platformFilter || ''}
                    onChange={(e) => setPlatformFilter(e.target.value || null)}
                    className="text-xs px-2 py-1 rounded border bg-background"
                >
                    <option value="">All Platforms</option>
                    <option value="GOOGLE_BUSINESS">Google</option>
                    <option value="FACEBOOK">Facebook</option>
                </select>

                <select
                    value={repliedFilter}
                    onChange={(e) => setRepliedFilter(e.target.value)}
                    className="text-xs px-2 py-1 rounded border bg-background"
                >
                    <option value="all">All Reviews</option>
                    <option value="unreplied">Unreplied</option>
                    <option value="replied">Replied</option>
                </select>

                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 ml-auto"
                    onClick={() => refetch()}
                    disabled={isLoading}
                >
                    <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
                </Button>
            </div>

            {/* Review list */}
            <div className="max-h-[500px] overflow-y-auto">
                {isLoading ? (
                    <>
                        <ReviewSkeleton />
                        <ReviewSkeleton />
                        <ReviewSkeleton />
                    </>
                ) : reviews.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Star className="h-10 w-10 mb-3 text-muted-foreground/40" />
                        <p className="text-sm font-medium">No reviews found</p>
                        <p className="text-xs mt-1">
                            Connect a Google Business or Facebook Page and sync to see reviews.
                        </p>
                    </div>
                ) : (
                    reviews.map((review) => (
                        <ReviewCard
                            key={review.id}
                            review={review}
                            onReply={(reviewId, text) =>
                                replyMutation.mutate({ reviewId, text })
                            }
                            isReplying={replyMutation.isPending}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
