/**
 * MiniCalendar Component
 * Inline calendar picker for scheduling posts
 */

'use client';

import { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    addMonths,
    subMonths,
    addDays,
    isSameDay,
    isSameMonth,
    isToday,
    isBefore,
    startOfDay,
} from 'date-fns';

interface MiniCalendarProps {
    /** Currently selected date */
    value: Date | null;
    /** Callback when date is selected */
    onChange: (date: Date) => void;
    /** Minimum selectable date (default: today) */
    minDate?: Date;
    /** Callback to close the calendar */
    onClose?: () => void;
    /** Additional CSS classes */
    className?: string;
}

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/**
 * Compact calendar for inline date selection
 * Why: Replaces dropdown with visual date picking for better UX
 */
export function MiniCalendar({
    value,
    onChange,
    minDate,
    onClose,
    className,
}: MiniCalendarProps) {
    const [viewMonth, setViewMonth] = useState(() => value || new Date());
    const effectiveMinDate = useMemo(() => minDate || startOfDay(new Date()), [minDate]);

    /**
     * Generate calendar grid for current view month
     * Why: Creates 6-week grid to ensure consistent layout
     */
    const calendarDays = useMemo(() => {
        const monthStart = startOfMonth(viewMonth);
        const monthEnd = endOfMonth(viewMonth);
        const calendarStart = startOfWeek(monthStart);
        const calendarEnd = endOfWeek(monthEnd);

        const days: Date[] = [];
        let current = calendarStart;

        while (current <= calendarEnd) {
            days.push(current);
            current = addDays(current, 1);
        }

        return days;
    }, [viewMonth]);

    /**
     * Navigate to previous month
     */
    const handlePrevMonth = useCallback(() => {
        setViewMonth((prev) => subMonths(prev, 1));
    }, []);

    /**
     * Navigate to next month
     */
    const handleNextMonth = useCallback(() => {
        setViewMonth((prev) => addMonths(prev, 1));
    }, []);

    /**
     * Handle day selection
     */
    const handleDayClick = useCallback(
        (day: Date) => {
            if (isBefore(day, effectiveMinDate)) return;
            onChange(day);
            onClose?.();
        },
        [onChange, onClose, effectiveMinDate]
    );

    /**
     * Jump to today
     */
    const handleTodayClick = useCallback(() => {
        const today = new Date();
        setViewMonth(today);
        onChange(today);
        onClose?.();
    }, [onChange, onClose]);

    return (
        <div
            className={cn(
                'w-64 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3 shadow-lg',
                className
            )}
        >
            {/* Header with Month Navigation */}
            <div className="mb-3 flex items-center justify-between">
                <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                >
                    <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {format(viewMonth, 'MMMM yyyy')}
                </span>
                <button
                    type="button"
                    onClick={handleNextMonth}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                >
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>

            {/* Weekday Labels */}
            <div className="mb-1 grid grid-cols-7 gap-1">
                {WEEKDAY_LABELS.map((day) => (
                    <div
                        key={day}
                        className="text-center text-[10px] font-medium text-[var(--text-muted)]"
                    >
                        {day}
                    </div>
                ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day) => {
                    const isCurrentMonth = isSameMonth(day, viewMonth);
                    const isSelected = value && isSameDay(day, value);
                    const isTodayDate = isToday(day);
                    const isDisabled = isBefore(day, effectiveMinDate);

                    return (
                        <button
                            key={day.toISOString()}
                            type="button"
                            onClick={() => handleDayClick(day)}
                            disabled={isDisabled}
                            className={cn(
                                'flex h-7 w-7 items-center justify-center rounded-lg text-xs font-medium transition-all',
                                // Base states
                                !isCurrentMonth && 'text-[var(--text-muted)] opacity-40',
                                isCurrentMonth && !isSelected && 'text-[var(--text-primary)]',
                                // Today indicator (gold ring)
                                isTodayDate && !isSelected && 'ring-1 ring-[var(--accent-gold)]',
                                // Selected state
                                isSelected && 'bg-[var(--accent-gold)] text-white',
                                // Hover
                                !isSelected &&
                                !isDisabled &&
                                'hover:bg-[var(--bg-tertiary)]',
                                // Disabled
                                isDisabled && 'cursor-not-allowed opacity-30'
                            )}
                        >
                            {format(day, 'd')}
                        </button>
                    );
                })}
            </div>

            {/* Footer with Today Button */}
            <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3">
                <button
                    type="button"
                    onClick={handleTodayClick}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-tertiary)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
                >
                    <Calendar className="h-3.5 w-3.5" />
                    Today
                </button>
                {value && (
                    <span className="text-xs text-[var(--text-muted)]">
                        {format(value, 'EEE, MMM d')}
                    </span>
                )}
            </div>
        </div>
    );
}

interface DatePickerButtonProps {
    /** Currently selected date */
    value: Date | null;
    /** Callback when date is selected */
    onChange: (date: Date) => void;
    /** Minimum selectable date */
    minDate?: Date;
    /** Additional CSS classes */
    className?: string;
}

/**
 * Button that opens the mini calendar in a popover
 * Why: Provides compact trigger for calendar without taking space
 */
export function DatePickerButton({
    value,
    onChange,
    minDate,
    className,
}: DatePickerButtonProps) {
    const [isOpen, setIsOpen] = useState(false);

    const displayText = useMemo(() => {
        if (!value) return 'Pick a date';
        if (isToday(value)) return 'Today';
        const tomorrow = addDays(new Date(), 1);
        if (isSameDay(value, tomorrow)) return 'Tomorrow';
        return format(value, 'MMM d, yyyy');
    }, [value]);

    return (
        <div className={cn('relative', className)}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-gold)] focus:border-[var(--accent-gold)] focus:outline-none"
            >
                <Calendar className="h-4 w-4 text-[var(--text-muted)]" />
                {displayText}
            </button>

            {/* Calendar Popover */}
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />
                    {/* Calendar */}
                    <div className="absolute top-full left-0 z-50 mt-1">
                        <MiniCalendar
                            value={value}
                            onChange={onChange}
                            minDate={minDate}
                            onClose={() => setIsOpen(false)}
                        />
                    </div>
                </>
            )}
        </div>
    );
}
