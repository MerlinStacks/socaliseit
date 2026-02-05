'use client';

/**
 * Timeline View Component (Gantt-style)
 * Shows posts across platforms on a horizontal time axis
 * Why: Visualize post overlap and identify scheduling conflicts
 */

import { useMemo } from 'react';
import { format, startOfDay, endOfDay, differenceInMinutes, addHours, isSameDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { type CalendarPost, platformColors, platformLabels, type Platform } from './calendar-types';
import { PostTooltip } from './post-tooltip';

interface TimelineViewProps {
    posts: Record<string, CalendarPost[]>;
    date: Date;
    onPostClick: (postKey: string) => void;
    className?: string;
}

// Hours to show in timeline (6 AM to 11 PM)
const START_HOUR = 6;
const END_HOUR = 23;
const HOURS_SHOWN = END_HOUR - START_HOUR;

/**
 * Gantt-style timeline showing posts across all platforms
 */
export function TimelineView({ posts, date, onPostClick, className }: TimelineViewProps) {
    // Flatten posts from Record to array andn filter for the selected date
    const dayPosts = useMemo(() => {
        const allPosts: CalendarPost[] = [];
        Object.values(posts).forEach(dayPosts => allPosts.push(...dayPosts));
        return allPosts.filter(post => isSameDay(new Date(post.time), date));
    }, [posts, date]);

    // Group posts by platform
    const postsByPlatform = useMemo(() => {
        const grouped: Record<string, CalendarPost[]> = {};
        dayPosts.forEach(post => {
            if (!grouped[post.platform]) {
                grouped[post.platform] = [];
            }
            grouped[post.platform].push(post);
        });
        return grouped;
    }, [dayPosts]);

    const platforms = Object.keys(postsByPlatform);
    const dayStart = addHours(startOfDay(date), START_HOUR);

    // Calculate position as percentage of timeline width
    const getPostPosition = (post: CalendarPost) => {
        const postTime = new Date(post.time);
        const minutesFromStart = differenceInMinutes(postTime, dayStart);
        const totalMinutes = HOURS_SHOWN * 60;
        return Math.max(0, Math.min(100, (minutesFromStart / totalMinutes) * 100));
    };

    // Generate hour markers
    const hours = Array.from({ length: HOURS_SHOWN + 1 }, (_, i) => START_HOUR + i);

    if (platforms.length === 0) {
        return (
            <div className={cn('flex items-center justify-center p-12 text-[var(--text-muted)]', className)}>
                <div className="text-center">
                    <p className="text-lg font-medium">No posts scheduled for {format(date, 'MMMM d')}</p>
                    <p className="text-sm mt-1">Schedule posts to see them on the timeline</p>
                </div>
            </div>
        );
    }

    return (
        <div className={cn('overflow-x-auto', className)}>
            {/* Header with hour markers */}
            <div className="flex border-b border-[var(--border)] min-w-[800px]">
                <div className="w-28 flex-shrink-0 px-3 py-2 text-xs font-medium text-[var(--text-muted)]">
                    Platform
                </div>
                <div className="flex-1 flex">
                    {hours.map(hour => (
                        <div
                            key={hour}
                            className="flex-1 px-1 py-2 text-center text-xs text-[var(--text-muted)] border-l border-[var(--border)]"
                        >
                            {format(addHours(startOfDay(date), hour), 'h a')}
                        </div>
                    ))}
                </div>
            </div>

            {/* Platform rows */}
            {platforms.map(platform => (
                <div
                    key={platform}
                    className="flex border-b border-[var(--border)] min-w-[800px] hover:bg-[var(--bg-secondary)]/50"
                >
                    {/* Platform label */}
                    <div className="w-28 flex-shrink-0 px-3 py-3 flex items-center gap-2">
                        <div
                            className={cn('w-3 h-3 rounded-full', platformColors[platform]?.replace('border-l-', 'bg-') || 'bg-gray-400')}
                            style={{ backgroundColor: platformColors[platform]?.replace('border-l-', '') }}
                        />
                        <span className="text-sm font-medium truncate">
                            {platformLabels[platform as Platform] || platform}
                        </span>
                    </div>

                    {/* Timeline track */}
                    <div className="flex-1 relative min-h-[48px]">
                        {/* Hour grid lines */}
                        <div className="absolute inset-0 flex">
                            {hours.map(hour => (
                                <div
                                    key={hour}
                                    className="flex-1 border-l border-[var(--border)]/50"
                                />
                            ))}
                        </div>

                        {/* Post blocks */}
                        {postsByPlatform[platform].map(post => {
                            const left = getPostPosition(post);
                            return (
                                <PostTooltip key={post.id} post={post}>
                                    <button
                                        onClick={() => onPostClick(post.id)}
                                        className={cn(
                                            'absolute top-1 h-10 min-w-[60px] rounded-lg px-2 py-1',
                                            'bg-[var(--accent-gold)] hover:bg-[var(--accent-gold-dark)]',
                                            'text-white text-xs font-medium truncate',
                                            'shadow-sm hover:shadow-md transition-all',
                                            'flex items-center gap-1'
                                        )}
                                        style={{ left: `${left}%` }}
                                    >
                                        <span className="truncate max-w-[120px]">
                                            {format(new Date(post.time), 'h:mm a')}
                                        </span>
                                        <StatusDot status={post.status} />
                                    </button>
                                </PostTooltip>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

/**
 * Small status dot indicator
 */
function StatusDot({ status }: { status: string }) {
    const colors: Record<string, string> = {
        draft: 'bg-gray-300',
        scheduled: 'bg-blue-400',
        published: 'bg-green-400',
        failed: 'bg-red-400',
        publishing: 'bg-yellow-400',
    };

    return (
        <span className={cn('w-2 h-2 rounded-full', colors[status] || colors.draft)} />
    );
}

export default TimelineView;
