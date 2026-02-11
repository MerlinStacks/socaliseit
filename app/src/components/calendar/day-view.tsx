/**
 * DayView Component - Hourly calendar view for a single day
 * Extracted from calendar/page.tsx for better maintainability
 */

'use client';

import { format, isSameDay } from 'date-fns';
import { CalendarSlot } from '@/components/calendar/calendar-slot';
import { DraggablePostCard } from '@/components/calendar/draggable-post-card';
import { NoteCard } from '@/components/calendar/note-card';
import { isAiRecommendedSlot, type AiRecommendedSlot } from '@/hooks/use-ai-recommended-slots';
import { type useDragDropCalendar } from '@/hooks/use-drag-drop-calendar';
import { type CalendarPost, type CalendarNote, getLocalHour, platformColors } from './calendar-types';
import type { Holiday } from '@/lib/holidays';

export interface DayViewProps {
    date: Date;
    posts: Record<string, CalendarPost[]>;
    notes: Record<string, CalendarNote[]>;
    aiSlots: AiRecommendedSlot[];
    dragState: ReturnType<typeof useDragDropCalendar>['dragState'];
    dragHandlers: ReturnType<typeof useDragDropCalendar>['handlers'];
    onPostClick: (dragKey: string) => void;
    onSlotClick: (date: Date, hour: number, platform?: string) => void;
    onNoteClick: (note: CalendarNote) => void;
    /** Holidays for this day */
    holidays?: Holiday[];
}

/**
 * DayView displays hourly slots from 6 AM to 11 PM
 * Why: Provides granular time-based view for detailed scheduling
 */
export function DayView({
    date,
    posts,
    notes,
    aiSlots,
    dragState,
    dragHandlers,
    onPostClick,
    onSlotClick,
    onNoteClick,
    holidays = [],
}: DayViewProps) {
    const dateKey = format(date, 'yyyy-MM-dd');
    const dayPosts = posts[dateKey] || [];
    const dayNotes = notes[dateKey] || [];

    // Generate hourly slots from 6 AM to 11 PM
    const hourSlots = Array.from({ length: 18 }, (_, i) => i + 6);

    const getPostsForHour = (hour: number) => {
        return dayPosts.filter(post => {
            const postHour = getLocalHour(post.time);
            return postHour === hour;
        });
    };

    return (
        <div className="card overflow-hidden" data-testid="calendar-day-view">
            {/* Holiday badges */}
            {holidays.length > 0 && (
                <div className="flex flex-wrap gap-1 border-b border-[var(--border)] bg-[var(--accent-gold)]/5 px-4 py-2">
                    {holidays.map((h) => (
                        <span
                            key={h.name}
                            className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-gold)]/10 px-2.5 py-1 text-xs font-medium text-[var(--accent-gold)]"
                        >
                            <span>{h.emoji}</span>
                            <span>{h.name}</span>
                        </span>
                    ))}
                </div>
            )}
            {/* Notes banner */}
            {dayNotes.length > 0 && (
                <div className="flex flex-wrap gap-2 border-b border-[var(--border)] bg-[var(--bg-tertiary)]/30 px-4 py-3">
                    {dayNotes.map(note => (
                        <NoteCard key={note.id} note={note} onClick={() => onNoteClick(note)} />
                    ))}
                </div>
            )}

            {hourSlots.map(hour => {
                const hourPosts = getPostsForHour(hour);
                const timeLabel = format(new Date().setHours(hour, 0, 0, 0), 'h a');
                const aiSlot = isAiRecommendedSlot(aiSlots, date, hour);
                const isDropTarget = dragState.isDragging;
                const isDropHover = dragState.dropTarget?.date &&
                    isSameDay(dragState.dropTarget.date, date) &&
                    dragState.dropTarget.hour === hour;

                return (
                    <div key={hour} className="grid grid-cols-[80px_1fr] border-b border-[var(--border)] last:border-0">
                        <div className="bg-[var(--bg-tertiary)] p-4 text-right text-sm font-medium text-[var(--text-muted)]">
                            {timeLabel}
                        </div>
                        <CalendarSlot
                            date={date}
                            hour={hour}
                            aiSlot={aiSlot}
                            isDropTarget={isDropTarget}
                            isDropHover={isDropHover}
                            onSlotClick={() => onSlotClick(date, hour, aiSlot?.platform)}
                            onDragOver={(e) => dragHandlers.onDragOver({ date, hour }, e)}
                            onDragLeave={dragHandlers.onDragLeave}
                            onDrop={(e) => dragHandlers.onDrop({ date, hour }, e)}
                            className="border-l-0"
                        >
                            {hourPosts.map(post => (
                                <DraggablePostCard
                                    key={post.dragKey}
                                    post={post}
                                    platformColors={platformColors}
                                    onClick={() => onPostClick(post.dragKey)}
                                    isDragging={dragState.draggedDragKey === post.dragKey}
                                    onDragStart={(e) => dragHandlers.onDragStart(post.id, e, post.dragKey)}
                                    onDragEnd={dragHandlers.onDragEnd}
                                />
                            ))}
                        </CalendarSlot>
                    </div>
                );
            })}
        </div>
    );
}
