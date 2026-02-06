/**
 * Post Preview Modal
 * Shows post details when clicking on calendar. Allows editing/rescheduling for draft/scheduled posts.
 * 
 * Why: Users need quick access to post details without leaving the calendar view.
 */

'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    X, Calendar, Clock, ExternalLink, Edit2, Trash2,
    Instagram, Youtube, Facebook, Image as ImageIcon,
    CheckCircle2, AlertCircle, Clock3, FileEdit, Loader2,
    RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, addDays, startOfWeek, isSameDay, addWeeks, subWeeks } from 'date-fns';
import { triggerHaptic } from '@/hooks/use-haptic';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toast';
import { PerformanceMetrics } from './performance-metrics';

interface PostAnalytics {
    impressions: number;
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    clicks: number;
    videoViews: number;
    videoWatchTime: number;
    avgWatchPercentage: number | null;
    syncedAt: string | null;
}

interface PostPreviewModalProps {
    post: {
        id: string;
        time: string;
        caption: string;
        platform: string;
        status: string;
        thumbnail: string | null;
        pillarColor: string | null;
        isExternal: boolean;
        externalUrl: string | null;
        isVideo?: boolean;
        analytics?: PostAnalytics | null;
    };
    isOpen: boolean;
    onClose: () => void;
    onRefresh: () => void;
}

const TIME_SLOTS = [
    { label: '9:00 AM', value: '09:00' },
    { label: '12:00 PM', value: '12:00' },
    { label: '3:00 PM', value: '15:00' },
    { label: '6:00 PM', value: '18:00' },
    { label: '7:30 PM', value: '19:30' },
    { label: '9:00 PM', value: '21:00' },
];

/**
 * Platform icon mapping
 */
function getPlatformIcon(platform: string) {
    const iconClass = 'h-5 w-5';
    switch (platform.toLowerCase()) {
        case 'instagram':
            return <Instagram className={cn(iconClass, 'text-pink-500')} />;
        case 'youtube':
            return <Youtube className={cn(iconClass, 'text-red-500')} />;
        case 'facebook':
            return <Facebook className={cn(iconClass, 'text-blue-500')} />;
        case 'tiktok':
            return (
                <svg className={cn(iconClass, 'text-white')} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z" />
                </svg>
            );
        case 'pinterest':
            return (
                <svg className={cn(iconClass, 'text-red-400')} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0a12 12 0 00-4.37 23.17c-.1-.94-.2-2.4.04-3.44l1.43-6.07s-.36-.73-.36-1.8c0-1.69.98-2.95 2.2-2.95 1.03 0 1.53.78 1.53 1.71 0 1.04-.66 2.6-1.01 4.05-.29 1.21.61 2.2 1.81 2.2 2.17 0 3.84-2.29 3.84-5.59 0-2.92-2.1-4.96-5.1-4.96-3.47 0-5.51 2.6-5.51 5.29 0 1.05.4 2.17.91 2.78a.36.36 0 01.08.35l-.34 1.38c-.05.22-.18.27-.41.16-1.53-.71-2.49-2.95-2.49-4.74 0-3.86 2.8-7.4 8.08-7.4 4.24 0 7.54 3.02 7.54 7.06 0 4.21-2.66 7.6-6.35 7.6-1.24 0-2.4-.64-2.8-1.4l-.76 2.9c-.27 1.06-1.01 2.39-1.5 3.2A12 12 0 1012 0z" />
                </svg>
            );
        default:
            return <ImageIcon className={iconClass} />;
    }
}

/**
 * Status configuration for visual indicators
 */
const STATUS_CONFIG: Record<string, { icon: React.ReactNode; bg: string; text: string; label: string }> = {
    draft: {
        icon: <FileEdit className="h-4 w-4" />,
        bg: 'bg-gray-500/20',
        text: 'text-gray-400',
        label: 'Draft',
    },
    scheduled: {
        icon: <Clock3 className="h-4 w-4" />,
        bg: 'bg-blue-500/20',
        text: 'text-blue-400',
        label: 'Scheduled',
    },
    publishing: {
        icon: <Loader2 className="h-4 w-4 animate-spin" />,
        bg: 'bg-yellow-500/20',
        text: 'text-yellow-400',
        label: 'Publishing',
    },
    published: {
        icon: <CheckCircle2 className="h-4 w-4" />,
        bg: 'bg-green-500/20',
        text: 'text-green-400',
        label: 'Published',
    },
    failed: {
        icon: <AlertCircle className="h-4 w-4" />,
        bg: 'bg-red-500/20',
        text: 'text-red-400',
        label: 'Failed',
    },
};

/**
 * Extracts time string (HH:mm) from ISO timestamp
 */
function extractTimeFromISO(isoString: string): string {
    const date = new Date(isoString);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

export function PostPreviewModal({ post, isOpen, onClose, onRefresh }: PostPreviewModalProps) {
    const router = useRouter();
    const [showReschedule, setShowReschedule] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    // Track failed thumbnail loads (external CDN URLs like TikTok may fail during impersonation)
    const [thumbnailError, setThumbnailError] = useState(false);

    // Reschedule state
    const [selectedDate, setSelectedDate] = useState(() => {
        const postDate = new Date(post.time);
        return new Date(postDate.getFullYear(), postDate.getMonth(), postDate.getDate());
    });
    const [selectedTime, setSelectedTime] = useState(() => extractTimeFromISO(post.time));
    const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

    /**
     * Sync state with props when modal opens or post changes
     * Why: useState initial values only run once on mount. When opening the modal
     * for a different post, we need to update state to match the new post's time.
     */
    useEffect(() => {
        if (isOpen) {
            const postDate = new Date(post.time);
            setSelectedDate(new Date(postDate.getFullYear(), postDate.getMonth(), postDate.getDate()));
            setSelectedTime(extractTimeFromISO(post.time));
            setWeekStart(startOfWeek(postDate, { weekStartsOn: 1 }));
            // Reset panel visibility when opening for a new post
            setShowReschedule(false);
            setShowDeleteConfirm(false);
            setThumbnailError(false);
        }
    }, [isOpen, post.time, post.id]);

    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    const statusConfig = STATUS_CONFIG[post.status.toLowerCase()] || STATUS_CONFIG.draft;

    /**
     * Whether editing is allowed for this post
     * Why: Published, failed, and external posts cannot be edited directly
     */
    /**
     * Whether editing is allowed for this post
     * Why: Draft, scheduled, AND failed posts can be edited to fix issues and reschedule
     */
    const canEdit = useMemo(() => {
        const status = post.status.toLowerCase();
        return !post.isExternal && (status === 'draft' || status === 'scheduled' || status === 'failed');
    }, [post.status, post.isExternal]);

    /**
     * Whether retry is available (only for failed posts)
     */
    const canRetry = useMemo(() => {
        return !post.isExternal && post.status.toLowerCase() === 'failed';
    }, [post.status, post.isExternal]);

    const canDelete = useMemo(() => {
        return !post.isExternal && post.status.toLowerCase() !== 'published';
    }, [post.status, post.isExternal]);

    /**
     * Retry publishing a failed post immediately
     */
    const handleRetry = useCallback(async () => {
        setIsSubmitting(true);
        triggerHaptic('medium');

        try {
            const response = await fetch(`/api/posts/${post.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'retry' }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to retry');
            }

            triggerHaptic('success');
            toast('success', 'Retrying', 'Post has been queued for publishing');
            onRefresh();
            onClose();
        } catch (error) {
            console.error('Retry failed:', error);
            triggerHaptic('error');
            toast('error', 'Retry failed', error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setIsSubmitting(false);
        }
    }, [post.id, onRefresh, onClose]);

    const handleDateSelect = useCallback((date: Date) => {
        triggerHaptic('light');
        setSelectedDate(date);
    }, []);

    const handleTimeSelect = useCallback((time: string) => {
        triggerHaptic('light');
        setSelectedTime(time);
    }, []);

    const handleEditPost = useCallback(() => {
        triggerHaptic('medium');
        router.push(`/compose?edit=${post.id}`);
        onClose();
    }, [post.id, router, onClose]);

    const handleReschedule = useCallback(async () => {
        setIsSubmitting(true);
        triggerHaptic('medium');

        try {
            // Build the new scheduled datetime
            const [hours, minutes] = selectedTime.split(':').map(Number);
            const newDate = new Date(selectedDate);
            newDate.setHours(hours, minutes, 0, 0);

            const response = await fetch(`/api/posts/${post.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'reschedule',
                    scheduledAt: newDate.toISOString(),
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to reschedule');
            }

            triggerHaptic('success');
            toast('success', 'Rescheduled', `Post moved to ${format(newDate, 'MMM d, h:mm a')}`);
            onRefresh();
            onClose();
        } catch (error) {
            console.error('Reschedule failed:', error);
            triggerHaptic('error');
            toast('error', 'Reschedule failed', error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setIsSubmitting(false);
        }
    }, [post.id, selectedDate, selectedTime, onRefresh, onClose]);

    const handleDelete = useCallback(async () => {
        setIsSubmitting(true);
        triggerHaptic('medium');

        try {
            const response = await fetch(`/api/posts/${post.id}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to delete');
            }

            triggerHaptic('success');
            toast('success', 'Deleted', 'Post has been removed');
            onRefresh();
            onClose();
        } catch (error) {
            console.error('Delete failed:', error);
            triggerHaptic('error');
            toast('error', 'Delete failed', error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setIsSubmitting(false);
            setShowDeleteConfirm(false);
        }
    }, [post.id, onRefresh, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            {/* Modal Container */}
            <div
                className="w-full max-w-lg mx-4 rounded-2xl bg-[var(--bg-secondary)]/95 backdrop-blur-xl shadow-2xl border border-[var(--border)]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
                    <div className="flex items-center gap-3">
                        {getPlatformIcon(post.platform)}
                        <div>
                            <span className="text-sm font-medium capitalize">{post.platform}</span>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className={cn(
                                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                                    statusConfig.bg,
                                    statusConfig.text
                                )}>
                                    {statusConfig.icon}
                                    {statusConfig.label}
                                </span>
                                {post.isExternal && (
                                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-purple-500/20 text-purple-400">
                                        External
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5">
                    {/* Thumbnail - with error fallback for external CDN URLs (TikTok, etc.) */}
                    {post.thumbnail && !thumbnailError ? (
                        <div className="mb-4 rounded-lg overflow-hidden bg-[var(--bg-tertiary)] aspect-video">
                            <img
                                src={post.thumbnail}
                                alt="Post thumbnail"
                                className="w-full h-full object-cover"
                                onError={() => setThumbnailError(true)}
                            />
                        </div>
                    ) : post.thumbnail && thumbnailError ? (
                        <div className="mb-4 rounded-lg overflow-hidden bg-[var(--bg-tertiary)] aspect-video flex items-center justify-center">
                            <div className="text-center">
                                <span className="text-4xl font-bold uppercase text-[var(--text-muted)]">
                                    {post.platform.charAt(0)}
                                </span>
                                <p className="text-xs text-[var(--text-muted)] mt-1">Media unavailable</p>
                            </div>
                        </div>
                    ) : null}

                    {/* Caption */}
                    <p className="text-sm whitespace-pre-wrap line-clamp-6 mb-4">
                        {post.caption || <span className="text-[var(--text-muted)] italic">No caption</span>}
                    </p>

                    {/* Scheduled Time */}
                    <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                        <Clock className="h-4 w-4" />
                        <span>
                            {post.status.toLowerCase() === 'published' ? 'Published' : 'Scheduled'}:{' '}
                            {format(new Date(post.time), 'MMM d, yyyy h:mm a')}
                        </span>
                    </div>

                    {/* Failed Post Warning */}
                    {post.status.toLowerCase() === 'failed' && (
                        <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                            <div className="flex items-start gap-2">
                                <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-medium text-red-400">Publishing Failed</p>
                                    <p className="text-xs text-[var(--text-muted)] mt-1">
                                        This post failed to publish. You can edit the content, reschedule it, or retry publishing.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Performance Analytics Panel - Only for published posts with data */}
                {post.status.toLowerCase() === 'published' && post.analytics && (
                    <PerformanceMetrics
                        analytics={post.analytics}
                        isVideo={post.isVideo}
                    />
                )}

                {/* Reschedule Panel (expandable) */}
                {showReschedule && canEdit && (
                    <div className="border-t border-[var(--border)] px-5 py-4 space-y-4">
                        {/* Week Navigator */}
                        <div className="flex items-center justify-between">
                            <button
                                onClick={() => setWeekStart(prev => subWeeks(prev, 1))}
                                className="rounded-lg p-2 hover:bg-[var(--bg-tertiary)] transition-colors"
                            >
                                <Calendar className="h-4 w-4" />
                            </button>
                            <span className="text-sm font-medium">
                                {format(weekStart, 'MMM d')} - {format(addDays(weekStart, 6), 'MMM d')}
                            </span>
                            <button
                                onClick={() => setWeekStart(prev => addWeeks(prev, 1))}
                                className="rounded-lg p-2 hover:bg-[var(--bg-tertiary)] transition-colors"
                            >
                                <Calendar className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Day Pills */}
                        <div className="grid grid-cols-7 gap-2">
                            {weekDays.map((day) => {
                                const isSelected = isSameDay(day, selectedDate);
                                const isToday = isSameDay(day, new Date());
                                const isPast = day < new Date() && !isToday;

                                return (
                                    <button
                                        key={day.toISOString()}
                                        onClick={() => !isPast && handleDateSelect(day)}
                                        disabled={isPast}
                                        className={cn(
                                            'flex flex-col items-center rounded-lg py-2 transition-colors',
                                            isSelected
                                                ? 'bg-gradient text-white'
                                                : isPast
                                                    ? 'opacity-40 cursor-not-allowed'
                                                    : 'hover:bg-[var(--bg-tertiary)]',
                                            isToday && !isSelected && 'ring-1 ring-[var(--accent-gold)]'
                                        )}
                                    >
                                        <span className="text-[10px] font-medium uppercase">
                                            {format(day, 'EEE')}
                                        </span>
                                        <span className="text-lg font-semibold">
                                            {format(day, 'd')}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Time Selector */}
                        <div className="grid grid-cols-3 gap-2">
                            {TIME_SLOTS.map((slot) => {
                                const isSelected = selectedTime === slot.value;
                                return (
                                    <button
                                        key={slot.value}
                                        onClick={() => handleTimeSelect(slot.value)}
                                        className={cn(
                                            'rounded-lg py-2 text-sm font-medium transition-colors',
                                            isSelected
                                                ? 'bg-[var(--accent-gold)] text-white'
                                                : 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)]'
                                        )}
                                    >
                                        {slot.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Confirm Reschedule */}
                        <Button
                            onClick={handleReschedule}
                            isLoading={isSubmitting}
                            className="w-full"
                        >
                            Confirm Reschedule
                        </Button>
                    </div>
                )}

                {/* Delete Confirmation */}
                {showDeleteConfirm && (
                    <div className="border-t border-[var(--border)] px-5 py-4">
                        <p className="text-sm text-[var(--text-muted)] mb-4">
                            Are you sure you want to delete this post? This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <Button
                                variant="secondary"
                                className="flex-1"
                                onClick={() => setShowDeleteConfirm(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="danger"
                                className="flex-1"
                                onClick={handleDelete}
                                isLoading={isSubmitting}
                            >
                                Delete Post
                            </Button>
                        </div>
                    </div>
                )}

                {/* Actions */}
                {!showReschedule && !showDeleteConfirm && (
                    <div className="border-t border-[var(--border)] px-5 py-4">
                        <div className="flex gap-3">
                            {/* External Link for published/external posts */}
                            {(post.isExternal || post.status.toLowerCase() === 'published') && post.externalUrl && (
                                <a
                                    href={post.externalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn(
                                        'flex-1 inline-flex items-center justify-center gap-2',
                                        'rounded-lg py-2.5 px-4 text-sm font-medium',
                                        'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)]',
                                        'border border-[var(--border)] transition-colors'
                                    )}
                                    onClick={() => triggerHaptic('light')}
                                >
                                    <ExternalLink className="h-4 w-4" />
                                    View on Platform
                                </a>
                            )}

                            {/* Edit/Reschedule/Delete for editable posts */}
                            {canEdit && (
                                <>
                                    <Button
                                        variant="secondary"
                                        className="flex-1"
                                        onClick={handleEditPost}
                                    >
                                        <Edit2 className="h-4 w-4" />
                                        Edit
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        className="flex-1"
                                        onClick={() => {
                                            triggerHaptic('light');
                                            setShowReschedule(true);
                                        }}
                                    >
                                        <Clock className="h-4 w-4" />
                                        Reschedule
                                    </Button>
                                    {canRetry && (
                                        <Button
                                            variant="primary"
                                            className="flex-1"
                                            onClick={handleRetry}
                                            isLoading={isSubmitting}
                                        >
                                            <RefreshCw className="h-4 w-4" />
                                            Retry
                                        </Button>
                                    )}
                                </>
                            )}

                            {canDelete && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                        triggerHaptic('light');
                                        setShowDeleteConfirm(true);
                                    }}
                                    className="text-[var(--error)] hover:text-[var(--error)] hover:bg-[var(--error)]/10"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
