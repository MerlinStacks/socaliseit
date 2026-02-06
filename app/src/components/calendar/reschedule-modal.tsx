/**
 * Reschedule Modal
 * Quick reschedule interface triggered by swipe gesture on calendar posts
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { X, Calendar, Clock, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, addDays, startOfWeek, isSameDay, addWeeks, subWeeks } from 'date-fns';
import { triggerHaptic } from '@/hooks/use-haptic';
import { cn } from '@/lib/utils';

interface RescheduleModalProps {
    post: {
        id: string;
        caption: string;
        platform: string;
        time: string;
    };
    isOpen: boolean;
    onClose: () => void;
    onReschedule: (postId: string, newDate: Date, newTime: string) => Promise<void>;
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
 * Extracts time string (HH:mm) from ISO timestamp
 */
function extractTimeFromISO(isoString: string): string {
    const date = new Date(isoString);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

export function RescheduleModal({ post, isOpen, onClose, onReschedule }: RescheduleModalProps) {
    const [selectedDate, setSelectedDate] = useState(() => {
        const postDate = new Date(post.time);
        return new Date(postDate.getFullYear(), postDate.getMonth(), postDate.getDate());
    });
    const [selectedTime, setSelectedTime] = useState(() => extractTimeFromISO(post.time));
    const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
    const [isSubmitting, setIsSubmitting] = useState(false);

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
        }
    }, [isOpen, post.time]);

    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    const handleDateSelect = useCallback((date: Date) => {
        triggerHaptic('light');
        setSelectedDate(date);
    }, []);

    const handleTimeSelect = useCallback((time: string) => {
        triggerHaptic('light');
        setSelectedTime(time);
    }, []);

    const handlePrevWeek = useCallback(() => {
        triggerHaptic('light');
        setWeekStart(prev => subWeeks(prev, 1));
    }, []);

    const handleNextWeek = useCallback(() => {
        triggerHaptic('light');
        setWeekStart(prev => addWeeks(prev, 1));
    }, []);

    const handleConfirm = useCallback(async () => {
        setIsSubmitting(true);
        triggerHaptic('medium');

        try {
            await onReschedule(post.id, selectedDate, selectedTime);
            triggerHaptic('success');
            onClose();
        } catch (error) {
            console.error('Reschedule failed:', error);
            triggerHaptic('error');
        } finally {
            setIsSubmitting(false);
        }
    }, [post.id, selectedDate, selectedTime, onReschedule, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm md:items-center">
            {/* Modal */}
            <div
                className="w-full max-w-md rounded-t-2xl bg-[var(--bg-secondary)] shadow-2xl md:rounded-2xl"
                style={{
                    paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 16px)',
                }}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
                    <h3 className="text-lg font-semibold">Reschedule Post</h3>
                    <button
                        onClick={() => {
                            triggerHaptic('light');
                            onClose();
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Post Preview */}
                <div className="border-b border-[var(--border)] px-5 py-3">
                    <p className="text-sm text-[var(--text-muted)] line-clamp-2">
                        {post.caption.slice(0, 100)}{post.caption.length > 100 ? '...' : ''}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Currently: {format(new Date(post.time), 'MMM d, h:mm a')}
                    </p>
                </div>

                {/* Week Selector */}
                <div className="px-5 py-4">
                    <div className="mb-3 flex items-center justify-between">
                        <button
                            onClick={handlePrevWeek}
                            className="rounded-lg p-2 hover:bg-[var(--bg-tertiary)]"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="text-sm font-medium">
                            {format(weekStart, 'MMM d')} - {format(addDays(weekStart, 6), 'MMM d')}
                        </span>
                        <button
                            onClick={handleNextWeek}
                            className="rounded-lg p-2 hover:bg-[var(--bg-tertiary)]"
                        >
                            <ChevronRight className="h-4 w-4" />
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
                </div>

                {/* Time Selector */}
                <div className="border-t border-[var(--border)] px-5 py-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--text-muted)]">
                        <Clock className="h-4 w-4" />
                        Select Time
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {TIME_SLOTS.map((slot) => {
                            const isSelected = selectedTime === slot.value;
                            return (
                                <button
                                    key={slot.value}
                                    onClick={() => handleTimeSelect(slot.value)}
                                    className={cn(
                                        'rounded-lg py-2.5 text-sm font-medium transition-colors',
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
                </div>

                {/* Actions */}
                <div className="flex gap-3 px-5 pt-2">
                    <Button
                        variant="secondary"
                        className="flex-1"
                        onClick={() => {
                            triggerHaptic('light');
                            onClose();
                        }}
                    >
                        Cancel
                    </Button>
                    <Button
                        className="flex-1"
                        onClick={handleConfirm}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? (
                            <span className="flex items-center gap-2">
                                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Updating...
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <Check className="h-4 w-4" />
                                Confirm
                            </span>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
