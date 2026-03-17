'use client';

/**
 * ReviewCard — single review card with glassmorphism container, inline reply,
 * AI suggestions, and keyboard shortcuts.
 *
 * Improvements over original:
 * - #2:  handleSubmit wrapped in useCallback
 * - #10: Ctrl+Enter / Cmd+Enter submits the reply
 * - #13: Card shows opacity overlay while reply mutation is in flight
 * - #14: Long review text (>300 chars) is collapsed with "Show more/less"
 * - #16: Reply text is NOT cleared in handleSubmit — parent clears via onReplySuccess
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
    Send,
    MessageSquare,
    Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PlatformIcon } from '@/components/compose/profile-selector';
import type { Platform } from '@/lib/platform-config';
import { StarRating } from './star-rating';
import { ReviewAiSuggestions } from './review-ai-suggestions';

// ============================================================================
// Types
// ============================================================================

export interface ReviewItem {
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
// Constants
// ============================================================================

/** Why: Reviews longer than this are collapsed with "Show more" toggle */
const TEXT_COLLAPSE_THRESHOLD = 300;

// ============================================================================
// Component
// ============================================================================

export function ReviewCard({
    review,
    onReply,
    isReplying,
    onReplySuccess,
}: {
    review: ReviewItem;
    onReply: (reviewId: string, text: string) => void;
    isReplying: boolean;
    /** Called by parent after mutation succeeds — used to clear local state */
    onReplySuccess?: () => void;
}) {
    const [replyText, setReplyText] = useState('');
    const [showReplyInput, setShowReplyInput] = useState(false);
    const [isTextExpanded, setIsTextExpanded] = useState(false);

    /**
     * Why (#16): We do NOT clear replyText here. The parent clears it via
     * onReplySuccess after the mutation succeeds, so the user can retry on failure
     * without retyping.
     */
    const handleSubmit = useCallback(() => {
        if (!replyText.trim()) return;
        onReply(review.id, replyText);
    }, [replyText, onReply, review.id]);

    /** Why (#10): Power users expect Ctrl+Enter / Cmd+Enter to submit */
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSubmit();
            }
        },
        [handleSubmit],
    );

    // Reset local state when parent signals success
    // Why: useCallback on onReplySuccess keeps stable reference
    const handleReplySuccess = useCallback(() => {
        setReplyText('');
        setShowReplyInput(false);
        onReplySuccess?.();
    }, [onReplySuccess]);

    // Why: Detect when isReplying transitions true→false to clear reply text.
    // This fires after the parent's mutation succeeds (isReplying becomes false).
    const wasReplying = useRef(false);
    useEffect(() => {
        if (wasReplying.current && !isReplying) {
            handleReplySuccess();
        }
        wasReplying.current = isReplying;
    }, [isReplying, handleReplySuccess]);

    // Determine if text should be truncated
    const reviewText = review.text || '';
    const isLongText = reviewText.length > TEXT_COLLAPSE_THRESHOLD;
    const displayText = isLongText && !isTextExpanded
        ? reviewText.slice(0, TEXT_COLLAPSE_THRESHOLD) + '…'
        : reviewText;

    return (
        <div
            className={cn(
                'glass-card card-hover p-4 transition-all duration-200',
                !review.isRead && 'ring-2',
                isReplying && 'opacity-60 pointer-events-none',
            )}
            style={{
                '--tw-ring-color': !review.isRead ? 'var(--accent-gold)' : undefined,
                background: !review.isRead ? 'var(--accent-gold-light)' : undefined,
            } as React.CSSProperties}
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

            {/* Review text — collapsible for long reviews (#14) */}
            {reviewText && (
                <div className="mt-3">
                    <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        {displayText}
                    </p>
                    {isLongText && (
                        <button
                            onClick={() => setIsTextExpanded(!isTextExpanded)}
                            className="text-xs font-medium mt-1 transition-colors duration-150"
                            style={{ color: 'var(--accent-gold)' }}
                        >
                            {isTextExpanded ? 'Show less' : 'Show more'}
                        </button>
                    )}
                </div>
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
                                onKeyDown={handleKeyDown}
                                placeholder="Write your reply… (Ctrl+Enter to send)"
                                className="w-full min-h-[60px] max-h-[120px] px-3 py-2 text-sm rounded-lg border resize-none focus:outline-none focus:ring-2"
                                style={{
                                    background: 'var(--bg-secondary)',
                                    borderColor: 'var(--border)',
                                    '--tw-ring-color': 'var(--accent-gold)',
                                } as React.CSSProperties}
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
