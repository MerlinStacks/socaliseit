/**
 * Swipeable Post Card
 * Calendar post card with swipe-to-reschedule functionality for mobile
 */

'use client';

import { useCallback } from 'react';
import { Calendar, Share2 } from 'lucide-react';
import { useSwipeGesture } from '@/hooks/use-swipe-gesture';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { type CalendarPost, formatTimeFromISO } from './calendar-types';
import { PostTypeIcon } from '@/components/compose/post-type-icon';
import type { PostType } from '@/lib/platform-config';
import { sharePost, isShareSupported, copyToClipboard } from '@/lib/web-share';
import { toast } from '@/components/ui/toast';

interface SwipeablePostCardProps {
    post: CalendarPost;
    platformColors: Record<string, string>;
    onClick: () => void;
    onReschedule: (post: CalendarPost) => void;
    compact?: boolean;
}

export function SwipeablePostCard({
    post,
    platformColors,
    onClick,
    onReschedule,
    compact
}: SwipeablePostCardProps) {
    const isMobile = useIsMobile();

    const handleSwipeRight = useCallback(() => {
        onReschedule(post);
    }, [post, onReschedule]);

    const handleShare = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation(); // Don't trigger card click

        if (isShareSupported()) {
            const result = await sharePost({ caption: post.caption || '' });
            if (!result.success && !result.cancelled) {
                toast('error', 'Share failed', result.error);
            }
        } else {
            // Fallback: copy to clipboard
            const success = await copyToClipboard(post.caption || '');
            if (success) {
                toast('success', 'Copied to clipboard');
            } else {
                toast('error', 'Failed to copy');
            }
        }
    }, [post.caption]);

    const { ref, isSwiping, offsetX, swipeProgress } = useSwipeGesture({
        onSwipeRight: handleSwipeRight,
        threshold: 80,
        disabled: !isMobile,
    });

    // Calculate background reveal based on swipe progress
    const showRescheduleHint = swipeProgress > 0.2;

    return (
        <div className="relative overflow-hidden rounded-lg mb-1">
            {/* Background action indicator (revealed on swipe) */}
            <div
                className={cn(
                    "absolute inset-y-0 left-0 flex items-center gap-2 rounded-lg bg-[var(--accent-gold)] px-4 transition-opacity",
                    showRescheduleHint ? "opacity-100" : "opacity-0"
                )}
                style={{ width: Math.max(offsetX, 0) }}
            >
                <Calendar className="h-4 w-4 text-white" />
                {offsetX > 60 && (
                    <span className="text-xs font-medium text-white whitespace-nowrap">
                        Reschedule
                    </span>
                )}
            </div>

            {/* Card content */}
            <div
                ref={ref}
                data-testid="calendar-post"
                data-platform={post.platform}
                onClick={onClick}
                className={cn(
                    "relative cursor-pointer rounded-lg border-l-[3px] bg-[var(--bg-secondary)] shadow-sm transition-all",
                    platformColors[post.platform] || 'border-l-gray-300',
                    compact ? "p-2" : "p-2.5",
                    isSwiping ? "transition-none" : "transition-transform duration-200"
                )}
                style={{
                    transform: `translateX(${offsetX}px)`,
                    borderLeftColor: post.pillarColor || undefined,
                }}
            >
                <div className="flex items-center gap-1.5">
                    {/* Post Type Icon */}
                    {post.postType && (
                        <PostTypeIcon
                            postType={post.postType as PostType}
                            size={14}
                            className="text-[var(--text-muted)] flex-shrink-0"
                        />
                    )}
                    <p className="text-xs text-[var(--text-muted)] flex-1">{formatTimeFromISO(post.time)}</p>

                    {/* Share button */}
                    <button
                        onClick={handleShare}
                        className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        title="Share post"
                    >
                        <Share2 className="h-3.5 w-3.5" />
                    </button>
                </div>
                {!compact && <p className="mt-1 truncate text-sm">{post.caption}</p>}
            </div>
        </div>
    );
}


/**
 * Simple post card for desktop (no swipe gestures)
 */
interface PostCardProps {
    post: CalendarPost;
    platformColors: Record<string, string>;
    onClick: () => void;
    compact?: boolean;
}

export function PostCard({ post, platformColors, onClick, compact }: PostCardProps) {
    return (
        <div
            data-testid="calendar-post"
            data-platform={post.platform}
            onClick={onClick}
            className={cn(
                "mb-1 cursor-pointer rounded-lg border-l-[3px] bg-[var(--bg-secondary)] shadow-sm transition-shadow hover:shadow-md",
                platformColors[post.platform] || 'border-l-gray-300',
                compact ? "p-2" : "p-2.5"
            )}
            style={post.pillarColor ? { borderLeftColor: post.pillarColor } : undefined}
        >
            <div className="flex items-center gap-1.5">
                {/* Post Type Icon */}
                {post.postType && (
                    <PostTypeIcon
                        postType={post.postType as PostType}
                        size={14}
                        className="text-[var(--text-muted)] flex-shrink-0"
                    />
                )}
                <p className="text-xs text-[var(--text-muted)]">{formatTimeFromISO(post.time)}</p>
            </div>
            {!compact && <p className="mt-1 truncate text-sm">{post.caption}</p>}
        </div>
    );
}
