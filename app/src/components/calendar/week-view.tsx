/**
 * WeekView Component - 7-day grid with time slots
 * Extracted from calendar/page.tsx for better maintainability
 */

'use client';

import { format, addDays, isSameDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { CalendarSlot } from '@/components/calendar/calendar-slot';
import { DraggablePostCard } from '@/components/calendar/draggable-post-card';
import { NoteCard } from '@/components/calendar/note-card';
import { isAiRecommendedSlot, type AiRecommendedSlot } from '@/hooks/use-ai-recommended-slots';
import { type useDragDropCalendar } from '@/hooks/use-drag-drop-calendar';
import { type CalendarPost, type CalendarNote, getLocalHour, platformColors } from './calendar-types';

export interface WeekViewProps {
    weekStart: Date;
    posts: Record<string, CalendarPost[]>;
    notes: Record<string, CalendarNote[]>;
    aiSlots: AiRecommendedSlot[];
    dragState: ReturnType<typeof useDragDropCalendar>['dragState'];
    dragHandlers: ReturnType<typeof useDragDropCalendar>['handlers'];
    onPostClick: (dragKey: string) => void;
    onSlotClick: (date: Date, hour: number, platform?: string) => void;
    onNoteClick: (note: CalendarNote) => void;
}

/**
 * WeekView displays 7 days with condensed time slots
 * Why: Provides overview of the week while maintaining clickable slots
 */
export function WeekView({
    weekStart,
    posts,
    notes,
    aiSlots,
    dragState,
    dragHandlers,
    onPostClick,
    onSlotClick,
    onNoteClick,
}: WeekViewProps) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const timeSlots = ['9 AM', '12 PM', '3 PM', '6 PM', '9 PM'];

    const hourRanges: Record<string, [number, number]> = {
        '9 AM': [6, 11],
        '12 PM': [11, 14],
        '3 PM': [14, 17],
        '6 PM': [17, 20],
        '9 PM': [20, 24],
    };

    // Map time slot labels to representative hours for AI slots
    const slotToHour: Record<string, number> = {
        '9 AM': 9,
        '12 PM': 12,
        '3 PM': 15,
        '6 PM': 18,
        '9 PM': 21,
    };

    const getPostsForSlot = (date: Date, timeSlot: string): CalendarPost[] => {
        const dateKey = format(date, 'yyyy-MM-dd');
        const dayPosts = posts[dateKey] || [];
        const [startHour, endHour] = hourRanges[timeSlot] || [0, 24];

        return dayPosts.filter(post => {
            const hour = getLocalHour(post.time);
            return hour >= startHour && hour < endHour;
        });
    };

    return (
        <div className="card overflow-hidden" data-testid="calendar-week-view">
            {/* Header Row */}
            <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-[var(--border)]">
                <div className="p-4" />
                {days.map((day) => {
                    const isToday = isSameDay(day, new Date());
                    return (
                        <div key={day.toISOString()} className="p-4 text-center" data-testid="calendar-day">
                            <p className="text-xs font-medium text-[var(--text-muted)]">
                                {format(day, 'EEE')}
                            </p>
                            <p className={cn("mt-1 text-xl font-semibold", isToday && "inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient text-white")}>
                                {format(day, 'd')}
                            </p>
                            {/* Day notes rendered under the header */}
                            {(() => {
                                const dateKey = format(day, 'yyyy-MM-dd');
                                const dayNotes = notes[dateKey] || [];
                                return dayNotes.length > 0 ? (
                                    <div className="mt-1 space-y-0.5">
                                        {dayNotes.map(note => (
                                            <NoteCard key={note.id} note={note} onClick={() => onNoteClick(note)} compact />
                                        ))}
                                    </div>
                                ) : null;
                            })()}
                        </div>
                    );
                })}
            </div>

            {/* Grid */}
            {timeSlots.map((time) => {
                const representativeHour = slotToHour[time];

                return (
                    <div key={time} className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-[var(--border)] last:border-0">
                        <div className="bg-[var(--bg-tertiary)] p-3 text-right text-xs font-medium text-[var(--text-muted)]">
                            {time}
                        </div>
                        {days.map((day) => {
                            const slotPosts = getPostsForSlot(day, time);
                            const aiSlot = isAiRecommendedSlot(aiSlots, day, representativeHour);
                            const isDropTarget = dragState.isDragging;
                            const isDropHover = dragState.dropTarget?.date &&
                                isSameDay(dragState.dropTarget.date, day) &&
                                dragState.dropTarget.hour === representativeHour;

                            return (
                                <CalendarSlot
                                    key={`${day.toISOString()}-${time}`}
                                    date={day}
                                    hour={representativeHour}
                                    aiSlot={aiSlot}
                                    isDropTarget={isDropTarget}
                                    isDropHover={isDropHover}
                                    onSlotClick={() => onSlotClick(day, representativeHour, aiSlot?.platform)}
                                    onDragOver={(e) => dragHandlers.onDragOver({ date: day, hour: representativeHour }, e)}
                                    onDragLeave={dragHandlers.onDragLeave}
                                    onDrop={(e) => dragHandlers.onDrop({ date: day, hour: representativeHour }, e)}
                                    className="min-h-[100px]"
                                >
                                    {slotPosts.map((post) => (
                                        <DraggablePostCard
                                            key={post.dragKey}
                                            post={post}
                                            platformColors={platformColors}
                                            onClick={() => onPostClick(post.dragKey)}
                                            compact
                                            isDragging={dragState.draggedDragKey === post.dragKey}
                                            onDragStart={(e) => dragHandlers.onDragStart(post.id, e, post.dragKey)}
                                            onDragEnd={dragHandlers.onDragEnd}
                                        />
                                    ))}
                                </CalendarSlot>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}
