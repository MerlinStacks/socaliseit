/**
 * DayView Component - Hourly calendar view for a single day
 * Extracted from calendar/page.tsx for better maintainability
 */

'use client';

import { format, isSameDay } from 'date-fns';
import { CalendarSlot } from '@/components/calendar/calendar-slot';
import { DraggablePostCard } from '@/components/calendar/draggable-post-card';
import { isAiRecommendedSlot, type AiRecommendedSlot } from '@/hooks/use-ai-recommended-slots';
import { type useDragDropCalendar } from '@/hooks/use-drag-drop-calendar';
import { type CalendarPost, getLocalHour, platformColors } from './calendar-types';

export interface DayViewProps {
    date: Date;
    posts: Record<string, CalendarPost[]>;
    aiSlots: AiRecommendedSlot[];
    dragState: ReturnType<typeof useDragDropCalendar>['dragState'];
    dragHandlers: ReturnType<typeof useDragDropCalendar>['handlers'];
    onPostClick: (id: string) => void;
    onSlotClick: (date: Date, hour: number, platform?: string) => void;
}

/**
 * DayView displays hourly slots from 6 AM to 11 PM
 * Why: Provides granular time-based view for detailed scheduling
 */
export function DayView({
    date,
    posts,
    aiSlots,
    dragState,
    dragHandlers,
    onPostClick,
    onSlotClick,
}: DayViewProps) {
    const dateKey = format(date, 'yyyy-MM-dd');
    const dayPosts = posts[dateKey] || [];

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
                                    onClick={() => onPostClick(post.id)}
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
