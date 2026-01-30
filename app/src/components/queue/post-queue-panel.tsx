/**
 * Post Queue Panel Component
 * Shows upcoming scheduled posts with quick actions
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Calendar, Clock, Edit2, Trash2, Play, Pause,
    MoreHorizontal, CheckCircle, AlertCircle, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface QueuedPost {
    id: string;
    caption: string;
    platforms: string[];
    scheduledAt: Date;
    status: 'scheduled' | 'publishing' | 'published' | 'failed';
    thumbnail?: string;
}

interface PostQueuePanelProps {
    posts: QueuedPost[];
    onEdit?: (postId: string) => void;
    onDelete?: (postId: string) => void;
    onPublishNow?: (postId: string) => void;
    onReschedule?: (postId: string) => void;
    className?: string;
}

export function PostQueuePanel({
    posts,
    onEdit,
    onDelete,
    onPublishNow,
    onReschedule,
    className,
}: PostQueuePanelProps) {
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const groupedPosts = groupByDate(posts);

    return (
        <div className={cn('space-y-6', className)}>
            {Object.entries(groupedPosts).map(([date, datePosts]) => (
                <div key={date}>
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--text-muted)]">
                        <Calendar className="h-4 w-4" />
                        {date}
                    </h3>
                    <div className="space-y-2">
                        {datePosts.map((post) => (
                            <PostQueueItem
                                key={post.id}
                                post={post}
                                expanded={expandedId === post.id}
                                onToggle={() => setExpandedId(expandedId === post.id ? null : post.id)}
                                onEdit={onEdit}
                                onDelete={onDelete}
                                onPublishNow={onPublishNow}
                                onReschedule={onReschedule}
                            />
                        ))}
                    </div>
                </div>
            ))}

            {posts.length === 0 && (
                <div className="rounded-lg border-2 border-dashed border-[var(--border)] p-8 text-center">
                    <Calendar className="mx-auto h-8 w-8 text-[var(--text-muted)]" />
                    <p className="mt-2 font-medium">No scheduled posts</p>
                    <p className="text-sm text-[var(--text-muted)]">
                        Create a post and schedule it to see it here
                    </p>
                </div>
            )}
        </div>
    );
}

interface PostQueueItemProps {
    post: QueuedPost;
    expanded: boolean;
    onToggle: () => void;
    onEdit?: (postId: string) => void;
    onDelete?: (postId: string) => void;
    onPublishNow?: (postId: string) => void;
    onReschedule?: (postId: string) => void;
}

function PostQueueItem({
    post,
    expanded,
    onToggle,
    onEdit,
    onDelete,
    onPublishNow,
    onReschedule,
}: PostQueueItemProps) {
    const platformColors: Record<string, string> = {
        instagram: 'bg-pink-500',
        tiktok: 'bg-gray-900',
        youtube: 'bg-red-500',
        facebook: 'bg-blue-500',
    };

    const statusIcons = {
        scheduled: <Clock className="h-4 w-4 text-[var(--accent-gold)]" />,
        publishing: <Loader2 className="h-4 w-4 animate-spin text-[var(--info)]" />,
        published: <CheckCircle className="h-4 w-4 text-[var(--success)]" />,
        failed: <AlertCircle className="h-4 w-4 text-[var(--error)]" />,
    };

    const time = new Date(post.scheduledAt).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
    });

    return (
        <div
            className={cn(
                'card overflow-hidden transition-all',
                expanded && 'ring-2 ring-[var(--accent-gold)]'
            )}
        >
            <div
                className="flex cursor-pointer items-center gap-4 p-4"
                onClick={onToggle}
            >
                {/* Thumbnail */}
                <div className="h-12 w-12 flex-shrink-0 rounded-lg bg-gradient-to-br from-purple-400 to-pink-400" />

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">{post.caption}</p>
                    <div className="mt-1 flex items-center gap-2">
                        <div className="flex -space-x-1">
                            {post.platforms.map((p) => (
                                <div
                                    key={p}
                                    className={cn(
                                        'h-4 w-4 rounded-full border-2 border-[var(--bg-secondary)]',
                                        platformColors[p] || 'bg-gray-400'
                                    )}
                                />
                            ))}
                        </div>
                        <span className="text-xs text-[var(--text-muted)]">{time}</span>
                    </div>
                </div>

                {/* Status */}
                <div className="flex items-center gap-2">
                    {statusIcons[post.status]}
                    <span className="text-xs capitalize text-[var(--text-muted)]">
                        {post.status}
                    </span>
                </div>

                {/* Menu */}
                <button className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]">
                    <MoreHorizontal className="h-4 w-4" />
                </button>
            </div>

            {/* Expanded Actions */}
            {expanded && (
                <div className="border-t border-[var(--border)] bg-[var(--bg-tertiary)] p-4">
                    <div className="flex gap-2">
                        {post.status === 'scheduled' && (
                            <>
                                <Button
                                    variant="secondary"
                                    className="flex-1"
                                    onClick={() => onEdit?.(post.id)}
                                >
                                    <Edit2 className="h-4 w-4" />
                                    Edit
                                </Button>
                                <Button
                                    variant="secondary"
                                    className="flex-1"
                                    onClick={() => onReschedule?.(post.id)}
                                >
                                    <Calendar className="h-4 w-4" />
                                    Reschedule
                                </Button>
                                <Button
                                    className="flex-1"
                                    onClick={() => onPublishNow?.(post.id)}
                                >
                                    <Play className="h-4 w-4" />
                                    Publish Now
                                </Button>
                            </>
                        )}
                        {post.status === 'failed' && (
                            <Button className="flex-1" onClick={() => onPublishNow?.(post.id)}>
                                Retry
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            className="text-[var(--error)]"
                            onClick={() => onDelete?.(post.id)}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Group posts by date
 */
function groupByDate(posts: QueuedPost[]): Record<string, QueuedPost[]> {
    const groups: Record<string, QueuedPost[]> = {};
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    posts.forEach((post) => {
        const date = new Date(post.scheduledAt);
        let label: string;

        if (isSameDay(date, today)) {
            label = 'Today';
        } else if (isSameDay(date, tomorrow)) {
            label = 'Tomorrow';
        } else {
            label = date.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
            });
        }

        if (!groups[label]) {
            groups[label] = [];
        }
        groups[label].push(post);
    });

    return groups;
}

function isSameDay(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}
