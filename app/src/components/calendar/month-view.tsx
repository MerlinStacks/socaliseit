/**
 * MonthView Component - Full month calendar grid with post thumbnails
 * Extracted from calendar/page.tsx for better maintainability
 */

'use client';

import { useState } from 'react';
import Image from 'next/image';
import { format, isSameDay, isSameMonth, isBefore, startOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { Plus, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type CalendarPost, type CalendarNote, formatTimeFromISO } from './calendar-types';
import { PostTooltip } from './post-tooltip';
import { NoteCard } from './note-card';
import { PostTypeIcon } from '@/components/compose/post-type-icon';
import type { PostType } from '@/lib/platform-config';
import { type useDragDropCalendar } from '@/hooks/use-drag-drop-calendar';
import type { PostPreviewMode } from '@/lib/stores/calendar-settings-store';
import type { Holiday } from '@/lib/holidays';

export interface MonthViewProps {
    monthStart: Date;
    posts: Record<string, CalendarPost[]>;
    notes: Record<string, CalendarNote[]>;
    /** Drag state from useDragDropCalendar hook */
    dragState: ReturnType<typeof useDragDropCalendar>['dragState'];
    /** Drag handlers from useDragDropCalendar hook */
    dragHandlers: ReturnType<typeof useDragDropCalendar>['handlers'];
    onPostClick: (dragKey: string) => void;
    onDayClick: (date: Date) => void;
    onNoteClick: (note: CalendarNote) => void;
    onNewNote: (date: Date) => void;
    /** Week start day: 0 = Sunday, 1 = Monday */
    weekStartsOn?: 0 | 1;
    /** Post preview display mode */
    postPreview?: PostPreviewMode;
    /** Holidays keyed by date string (YYYY-MM-DD) */
    holidays?: Record<string, Holiday[]>;
}

/**
 * Platform icon component for month view
 * Why: Compact icons to identify platform at a glance
 */
function PlatformIcon({ platform, className = '' }: { platform: string; className?: string }) {
    const iconClass = cn('h-3.5 w-3.5 flex-shrink-0', className);

    switch (platform.toLowerCase()) {
        case 'instagram':
            return (
                <svg className={cn(iconClass, 'text-pink-500')} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
            );
        case 'facebook':
            return (
                <svg className={cn(iconClass, 'text-blue-600')} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
            );
        case 'tiktok':
            // Why: Using black color for visibility on white backgrounds
            return (
                <svg className={cn(iconClass, 'text-black dark:text-gray-100')} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z" />
                </svg>
            );
        case 'youtube':
            return (
                <svg className={cn(iconClass, 'text-red-500')} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
            );
        case 'pinterest':
            return (
                <svg className={cn(iconClass, 'text-red-500')} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0a12 12 0 00-4.37 23.17c-.1-.94-.2-2.4.04-3.44l1.43-6.07s-.36-.73-.36-1.8c0-1.69.98-2.95 2.2-2.95 1.03 0 1.53.78 1.53 1.71 0 1.04-.66 2.6-1.01 4.05-.29 1.21.61 2.2 1.81 2.2 2.17 0 3.84-2.29 3.84-5.59 0-2.92-2.1-4.96-5.1-4.96-3.47 0-5.51 2.6-5.51 5.29 0 1.05.4 2.17.91 2.78a.36.36 0 01.08.35l-.34 1.38c-.05.22-.18.27-.41.16-1.53-.71-2.49-2.95-2.49-4.74 0-3.86 2.8-7.4 8.08-7.4 4.24 0 7.54 3.02 7.54 7.06 0 4.21-2.66 7.6-6.35 7.6-1.24 0-2.4-.64-2.8-1.4l-.76 2.9c-.27 1.06-1.01 2.39-1.5 3.2A12 12 0 1012 0z" />
                </svg>
            );
        case 'linkedin':
            return (
                <svg className={cn(iconClass, 'text-blue-700')} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
            );
        case 'bluesky':
            return (
                <svg className={cn(iconClass, 'text-sky-500')} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 01-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z" />
                </svg>
            );
        default:
            return (
                <div className={cn(iconClass, 'rounded-full bg-gray-500')} />
            );
    }
}

// Post type icons now use shared component from @/components/compose/post-type-icon

/**
 * Status dot indicator
 * Why: Visual indicator for post status without taking much space
 */
function StatusDot({ status }: { status: string }) {
    const statusColors: Record<string, string> = {
        published: 'bg-green-500',
        scheduled: 'bg-blue-500',
        draft: 'bg-gray-400',
        failed: 'bg-red-500',
        publishing: 'bg-yellow-500',
    };

    return (
        <span className={cn(
            'h-1.5 w-1.5 rounded-full flex-shrink-0',
            statusColors[status.toLowerCase()] || 'bg-gray-400'
        )} />
    );
}

/**
 * Compact post card for month view with drag support
 * Why: Shows thumbnail, platform, time and caption in a space-efficient layout
 */
function MonthPostCard({
    post,
    onClick,
    isDragging,
    onDragStart,
    onDragEnd,
}: {
    post: CalendarPost;
    onClick: () => void;
    isDragging?: boolean;
    onDragStart?: (e: React.DragEvent) => void;
    onDragEnd?: () => void;
}) {
    // Track failed thumbnail loads (external CDN URLs often expire)
    const [thumbnailError, setThumbnailError] = useState(false);
    const showThumbnail = post.thumbnail && !thumbnailError;

    // External posts cannot be dragged
    const isDraggable = !!onDragStart && !post.isExternal;

    return (
        <div
            data-testid="calendar-post"
            data-platform={post.platform}
            data-post-id={post.id}
            draggable={isDraggable}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            className={cn(
                "group/post flex items-center gap-1.5 rounded-md p-1 cursor-pointer",
                "bg-[var(--bg-secondary)]/80 hover:bg-[var(--bg-tertiary)]",
                "border border-transparent hover:border-[var(--border)]",
                "transition-all duration-150",
                isDragging && "opacity-50 rotate-1 scale-95",
                isDraggable && "cursor-grab active:cursor-grabbing"
            )}
        >
            {/* Drag Handle - visible on hover for draggable posts */}
            {isDraggable && (
                <div className="flex-shrink-0 opacity-0 group-hover/post:opacity-50 transition-opacity">
                    <GripVertical className="h-3 w-3 text-[var(--text-muted)]" />
                </div>
            )}
            {/* Thumbnail - with error fallback for expired external CDN URLs */}
            {showThumbnail ? (
                <div className="h-8 w-8 flex-shrink-0 rounded overflow-hidden bg-[var(--bg-tertiary)] relative">
                    <Image
                        src={post.thumbnail!}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="32px"
                        onError={() => setThumbnailError(true)}
                        unoptimized={post.isExternal} // External URLs can't be optimized
                    />
                </div>
            ) : (
                <div className="h-8 w-8 flex-shrink-0 rounded bg-[var(--bg-tertiary)] flex items-center justify-center">
                    <PlatformIcon platform={post.platform} />
                </div>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0 overflow-hidden">
                <div className="flex items-center gap-1">
                    <PlatformIcon platform={post.platform} className="h-3 w-3" />
                    {post.postType && (
                        <PostTypeIcon
                            postType={post.postType as PostType}
                            size={12}
                            className="text-[var(--text-muted)]"
                        />
                    )}
                    <span className="text-[10px] font-medium text-[var(--text-muted)]">
                        {formatTimeFromISO(post.time)}
                    </span>
                    <StatusDot status={post.status} />
                    {post.isExternal && (
                        <span className="text-[8px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-400">
                            ext
                        </span>
                    )}
                </div>

                {/* Caption preview */}
                <p className="text-[10px] text-[var(--text-primary)] truncate leading-tight mt-0.5">
                    {post.caption || <span className="italic text-[var(--text-muted)]">No caption</span>}
                </p>
            </div>
        </div>
    );
}

/**
 * MonthView displays a full month calendar grid
 * Why: Provides high-level overview of scheduled content
 */
export function MonthView({ monthStart, posts, notes, dragState, dragHandlers, onPostClick, onDayClick, onNoteClick, onNewNote, weekStartsOn = 1, postPreview = 'large', holidays = {} }: MonthViewProps) {
    // Track which days are expanded to show all posts
    const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

    const monthEnd = endOfMonth(monthStart);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn });

    const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    const weeks = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
        weeks.push(calendarDays.slice(i, i + 7));
    }

    // Why: Dynamic day names so toggling week start day reorders the header
    const allDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayNames = weekStartsOn === 1
        ? [...allDayNames.slice(1), allDayNames[0]]
        : allDayNames;

    // How many posts to show before "View more" link
    const MAX_VISIBLE_POSTS = 4;

    /**
     * Toggle expanded state for a day
     * Why: Allows users to see all posts when clicking "View more"
     */
    const toggleDayExpanded = (dateKey: string) => {
        setExpandedDays(prev => {
            const next = new Set(prev);
            if (next.has(dateKey)) {
                next.delete(dateKey);
            } else {
                next.add(dateKey);
            }
            return next;
        });
    };

    return (
        <div className="card overflow-hidden" data-testid="calendar-month-view">
            {/* Day names header */}
            <div className="grid grid-cols-7 border-b border-[var(--border)]">
                {dayNames.map(day => (
                    <div key={day} className="p-3 text-center text-xs font-medium text-[var(--text-muted)]">
                        {day}
                    </div>
                ))}
            </div>

            {/* Calendar grid */}
            {weeks.map((week, weekIdx) => (
                <div key={weekIdx} className="grid grid-cols-7 border-b border-[var(--border)] last:border-0">
                    {week.map(day => {
                        const dateKey = format(day, 'yyyy-MM-dd');
                        const dayPosts = posts[dateKey] || [];
                        const today = new Date();
                        const isToday = isSameDay(day, today);
                        const isCurrentMonth = isSameMonth(day, monthStart);
                        // Why: Visual distinction for days that have already passed
                        const isPast = isBefore(startOfDay(day), startOfDay(today));
                        const isExpanded = expandedDays.has(dateKey);
                        const visiblePosts = isExpanded ? dayPosts : dayPosts.slice(0, MAX_VISIBLE_POSTS);
                        const hasMore = dayPosts.length > MAX_VISIBLE_POSTS;
                        const dayNotes = notes[dateKey] || [];
                        const dayHolidays = holidays[dateKey] || [];

                        // Drag-drop state for this day
                        const isDropTarget = dragState.isDragging;
                        const isDropHover = dragState.dropTarget?.date &&
                            isSameDay(dragState.dropTarget.date, day);

                        return (
                            <div
                                key={day.toISOString()}
                                data-testid="calendar-day"
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    // preserveTime: keep original scheduled time when moving between days
                                    dragHandlers.onDragOver({ date: day, hour: 12, preserveTime: true }, e);
                                }}
                                onDragLeave={dragHandlers.onDragLeave}
                                onDrop={(e) => dragHandlers.onDrop({ date: day, hour: 12, preserveTime: true }, e)}
                                className={cn(
                                    "group relative min-h-[140px] border-l border-[var(--border)] first:border-l-0 p-1.5 cursor-pointer transition-colors",
                                    !isCurrentMonth && "bg-[var(--bg-tertiary)]/50 text-[var(--text-muted)]",
                                    isPast && isCurrentMonth && "bg-[var(--bg-tertiary)]/30",
                                    !isPast && "hover:bg-[var(--bg-tertiary)]/30",
                                    // Drop zone highlighting
                                    isDropTarget && "bg-[var(--accent-gold)]/5",
                                    isDropHover && "bg-[var(--accent-gold)]/15 ring-2 ring-[var(--accent-gold)] ring-inset"
                                )}
                            >
                                {/* Day number and add button */}
                                <div className="flex items-center justify-between mb-1">
                                    <p className={cn(
                                        "text-xs font-medium",
                                        isToday && "inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient text-white text-[10px]",
                                        isPast && !isToday && "text-[var(--text-muted)]"
                                    )}>
                                        {format(day, 'd')}
                                    </p>

                                    {/* Add button on hover */}
                                    <div className="flex items-center gap-0.5">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onNewNote(day);
                                            }}
                                            className={cn(
                                                'opacity-0 group-hover:opacity-100 transition-opacity',
                                                'rounded-full p-0.5 hover:bg-[var(--accent-gold)]/20',
                                                'text-[var(--text-muted)] hover:text-[var(--accent-gold)]'
                                            )}
                                            title="Add note"
                                        >
                                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                                                <polyline points="14 2 14 8 20 8" />
                                                <line x1="12" y1="18" x2="12" y2="12" />
                                                <line x1="9" y1="15" x2="15" y2="15" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDayClick(day);
                                            }}
                                            className={cn(
                                                'opacity-0 group-hover:opacity-100 transition-opacity',
                                                'rounded-full p-0.5 hover:bg-[var(--accent-gold)]/20',
                                                'text-[var(--accent-gold)]'
                                            )}
                                            title="Create new post"
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Drop indicator during drag */}
                                {isDropHover && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                                        <span className="text-xs font-medium text-[var(--accent-gold)] bg-[var(--bg-primary)]/90 px-2 py-1 rounded-md shadow-sm">
                                            Drop to reschedule
                                        </span>
                                    </div>
                                )}

                                {/* Holiday badges */}
                                {dayHolidays.length > 0 && (
                                    <div className="flex flex-wrap gap-0.5 mb-1 px-0.5">
                                        {dayHolidays.map((h) => (
                                            <span
                                                key={h.name}
                                                title={h.name}
                                                className="inline-flex items-center gap-0.5 rounded-full bg-[var(--accent-gold)]/10 px-1.5 py-0.5 text-[9px] font-medium text-[var(--accent-gold)] truncate max-w-full"
                                            >
                                                <span>{h.emoji}</span>
                                                <span className="truncate">{h.name}</span>
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Notes */}
                                {dayNotes.length > 0 && (
                                    <div className="space-y-0.5 mb-1" onClick={(e) => e.stopPropagation()}>
                                        {dayNotes.map(note => (
                                            <NoteCard key={note.id} note={note} onClick={() => onNoteClick(note)} />
                                        ))}
                                    </div>
                                )}

                                {/* Posts */}
                                <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                                    {visiblePosts.map(post => (
                                        <PostTooltip key={post.dragKey} post={post}>
                                            <div>
                                                {postPreview === 'none' ? (
                                                    /* No preview: just platform icon + time */
                                                    <div
                                                        data-testid="calendar-post"
                                                        data-platform={post.platform}
                                                        data-post-id={post.id}
                                                        onClick={(e) => { e.stopPropagation(); onPostClick(post.dragKey); }}
                                                        className="flex items-center gap-1 rounded px-1 py-0.5 cursor-pointer hover:bg-[var(--bg-tertiary)] text-[10px]"
                                                    >
                                                        <PlatformIcon platform={post.platform} className="h-3 w-3" />
                                                        <StatusDot status={post.status} />
                                                        <span className="text-[var(--text-muted)] truncate">{formatTimeFromISO(post.time)}</span>
                                                    </div>
                                                ) : postPreview === 'condensed' ? (
                                                    /* Condensed: single line with caption */
                                                    <div
                                                        data-testid="calendar-post"
                                                        data-platform={post.platform}
                                                        data-post-id={post.id}
                                                        onClick={(e) => { e.stopPropagation(); onPostClick(post.dragKey); }}
                                                        className="flex items-center gap-1 rounded px-1 py-0.5 cursor-pointer hover:bg-[var(--bg-tertiary)] text-[10px]"
                                                    >
                                                        <PlatformIcon platform={post.platform} className="h-3 w-3" />
                                                        <StatusDot status={post.status} />
                                                        <span className="text-[var(--text-muted)]">{formatTimeFromISO(post.time)}</span>
                                                        <span className="truncate flex-1 text-[var(--text-primary)]">{post.caption || 'No caption'}</span>
                                                    </div>
                                                ) : (
                                                    /* Small or Large: use MonthPostCard (large has thumbnail by default, small hides it) */
                                                    <MonthPostCard
                                                        post={postPreview === 'small' ? { ...post, thumbnail: null } : post}
                                                        onClick={() => onPostClick(post.dragKey)}
                                                        isDragging={dragState.draggedDragKey === post.dragKey}
                                                        onDragStart={(e) => {
                                                            e.dataTransfer.setData('application/x-original-time', post.time);
                                                            dragHandlers.onDragStart(post.id, e, post.dragKey);
                                                        }}
                                                        onDragEnd={dragHandlers.onDragEnd}
                                                    />
                                                )}
                                            </div>
                                        </PostTooltip>
                                    ))}

                                    {/* View more / Show less toggle */}
                                    {hasMore && (
                                        <button
                                            className="text-[10px] text-[var(--accent-gold)] hover:underline font-medium"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleDayExpanded(dateKey);
                                            }}
                                        >
                                            {isExpanded ? 'Show less' : `+${dayPosts.length - MAX_VISIBLE_POSTS} more`}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
