/**
 * Scrollable Time Picker Component
 * Allows selecting times with minute-level granularity via scrollable panel.
 */

'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Clock, Sparkles, ChevronUp, ChevronDown, X } from 'lucide-react';

interface OptimalTimeSuggestion {
    time: string;
    label: string;
    lift: number;
}

interface ScrollableTimePickerProps {
    /** Time value in "HH:MM" 24-hour format */
    value: string;
    /** Callback when time changes */
    onChange: (time: string) => void;
    /** Optional AI-suggested optimal times */
    optimalTimes?: OptimalTimeSuggestion[];
    /** Whether optimal times panel is showing */
    showOptimal?: boolean;
    /** Toggle optimal times display */
    onToggleOptimal?: () => void;
    /** Whether picker is disabled */
    disabled?: boolean;
    /** Additional CSS classes */
    className?: string;
}

/**
 * Generate time options in 5-minute increments
 * Why: 1-minute increments would be 1440 options, 5-minute gives 288 manageable options
 */
function generateTimeOptions(): Array<{ value: string; label: string }> {
    const options: Array<{ value: string; label: string }> = [];

    for (let hour = 0; hour < 24; hour++) {
        for (let minute = 0; minute < 60; minute += 5) {
            const value = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            const period = hour >= 12 ? 'PM' : 'AM';
            const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
            const label = `${hour12}:${minute.toString().padStart(2, '0')} ${period}`;
            options.push({ value, label });
        }
    }

    return options;
}

/**
 * Format 24-hour time to 12-hour display
 */
function formatTime12Hour(time24: string): string {
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Parse 12-hour time input to 24-hour format
 */
function parseTimeInput(input: string): string | null {
    // Try to parse formats like "9:43 AM", "2:17 PM", "14:30", etc.
    const cleanInput = input.trim().toUpperCase();

    // Match 12-hour format with AM/PM
    const match12 = cleanInput.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
    if (match12) {
        let hour = parseInt(match12[1], 10);
        const minute = parseInt(match12[2], 10);
        const period = match12[3];

        if (minute < 0 || minute > 59) return null;

        if (period) {
            if (hour < 1 || hour > 12) return null;
            if (period === 'PM' && hour !== 12) hour += 12;
            if (period === 'AM' && hour === 12) hour = 0;
        } else {
            // 24-hour format
            if (hour < 0 || hour > 23) return null;
        }

        return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    }

    return null;
}

const TIME_OPTIONS = generateTimeOptions();

/**
 * Scrollable time picker with minute-level granularity
 */
export function ScrollableTimePicker({
    value,
    onChange,
    optimalTimes = [],
    showOptimal = false,
    onToggleOptimal,
    disabled = false,
    className,
}: ScrollableTimePickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState(formatTime12Hour(value));
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Update input value when external value changes
    useEffect(() => {
        if (!isOpen) {
            setInputValue(formatTime12Hour(value));
        }
    }, [value, isOpen]);

    // Scroll to current value when opening
    useEffect(() => {
        if (isOpen && listRef.current) {
            const index = TIME_OPTIONS.findIndex(opt => opt.value === value);
            if (index >= 0) {
                const itemHeight = 36; // Approximate height of each item
                listRef.current.scrollTop = Math.max(0, index * itemHeight - 100);
                setHighlightedIndex(index);
            }
        }
    }, [isOpen, value]);

    // Close on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isOpen]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);

        // Try to parse and apply
        const parsed = parseTimeInput(e.target.value);
        if (parsed) {
            onChange(parsed);
        }
    }, [onChange]);

    const handleInputBlur = useCallback(() => {
        // Reset to formatted value if input is invalid
        const parsed = parseTimeInput(inputValue);
        if (parsed) {
            onChange(parsed);
            setInputValue(formatTime12Hour(parsed));
        } else {
            setInputValue(formatTime12Hour(value));
        }
    }, [inputValue, value, onChange]);

    const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleInputBlur();
            setIsOpen(false);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setIsOpen(true);
            setHighlightedIndex(prev => Math.min(prev + 1, TIME_OPTIONS.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setIsOpen(true);
            setHighlightedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        }
    }, [handleInputBlur]);

    const handleSelectTime = useCallback((time: string) => {
        onChange(time);
        setInputValue(formatTime12Hour(time));
        setIsOpen(false);
    }, [onChange]);

    const isOptimalTime = useCallback((time: string) => {
        return optimalTimes.some(opt => opt.time === time);
    }, [optimalTimes]);

    const getOptimalLift = useCallback((time: string) => {
        const opt = optimalTimes.find(o => o.time === time);
        return opt?.lift;
    }, [optimalTimes]);

    // Find closest time option for custom times
    const closestOption = useMemo(() => {
        const exactMatch = TIME_OPTIONS.find(opt => opt.value === value);
        if (exactMatch) return null; // No need to show if exact match exists

        // Find closest 5-minute increment
        const [hours, minutes] = value.split(':').map(Number);
        const roundedMinutes = Math.round(minutes / 5) * 5;
        const adjustedMinutes = roundedMinutes === 60 ? 0 : roundedMinutes;
        const adjustedHours = roundedMinutes === 60 ? (hours + 1) % 24 : hours;
        return `${adjustedHours.toString().padStart(2, '0')}:${adjustedMinutes.toString().padStart(2, '0')}`;
    }, [value]);

    return (
        <div ref={containerRef} className={cn('relative', className)}>
            {/* Input Field */}
            <div className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-[var(--text-muted)] flex-shrink-0" />
                <div className="relative flex-1">
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={handleInputChange}
                        onBlur={handleInputBlur}
                        onKeyDown={handleInputKeyDown}
                        onFocus={() => setIsOpen(true)}
                        disabled={disabled}
                        placeholder="9:00 AM"
                        className={cn(
                            'w-full rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1 text-xs outline-none',
                            'focus:border-[var(--accent-gold)] focus:ring-1 focus:ring-[var(--accent-gold)]',
                            disabled && 'opacity-60 cursor-not-allowed'
                        )}
                    />
                    <button
                        type="button"
                        onClick={() => !disabled && setIsOpen(!isOpen)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        disabled={disabled}
                    >
                        {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                </div>
            </div>

            {/* Dropdown Panel */}
            {isOpen && !disabled && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] shadow-lg">
                    {/* Optimal Times Section */}
                    {showOptimal && optimalTimes.length > 0 && (
                        <div className="border-b border-[var(--border)] p-2">
                            <div className="flex items-center gap-1 mb-2 text-xs font-medium text-[var(--accent-gold)]">
                                <Sparkles className="h-3 w-3" />
                                Best Times to Post
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {optimalTimes.map((opt) => (
                                    <button
                                        key={opt.time}
                                        type="button"
                                        onClick={() => handleSelectTime(opt.time)}
                                        className={cn(
                                            'flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors',
                                            value === opt.time
                                                ? 'bg-[var(--accent-gold)] text-white'
                                                : 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)] hover:bg-[var(--accent-gold)] hover:text-white'
                                        )}
                                    >
                                        <span>{opt.label}</span>
                                        {opt.lift > 0 && (
                                            <span className="opacity-80">+{opt.lift}%</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Toggle Optimal Times */}
                    {onToggleOptimal && !showOptimal && optimalTimes.length > 0 && (
                        <button
                            type="button"
                            onClick={onToggleOptimal}
                            className="flex w-full items-center gap-1 border-b border-[var(--border)] p-2 text-xs text-[var(--accent-gold)] hover:bg-[var(--bg-tertiary)]"
                        >
                            <Sparkles className="h-3 w-3" />
                            Show optimal times
                        </button>
                    )}

                    {/* Time List */}
                    <div
                        ref={listRef}
                        className="max-h-[200px] overflow-y-auto"
                    >
                        {/* Custom time indicator if not a 5-minute increment */}
                        {closestOption && (
                            <div className="flex items-center justify-between px-3 py-2 text-xs bg-[var(--bg-tertiary)] border-b border-[var(--border)]">
                                <span className="text-[var(--text-muted)]">Custom time:</span>
                                <span className="font-medium">{formatTime12Hour(value)}</span>
                            </div>
                        )}

                        {TIME_OPTIONS.map((option, index) => {
                            const isSelected = option.value === value || option.value === closestOption;
                            const isHighlighted = index === highlightedIndex;
                            const optimal = isOptimalTime(option.value);
                            const lift = getOptimalLift(option.value);

                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => handleSelectTime(option.value)}
                                    className={cn(
                                        'flex w-full items-center justify-between px-3 py-2 text-xs transition-colors',
                                        isSelected && 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)] font-medium',
                                        isHighlighted && !isSelected && 'bg-[var(--bg-tertiary)]',
                                        !isSelected && !isHighlighted && 'hover:bg-[var(--bg-tertiary)]'
                                    )}
                                >
                                    <span>{option.label}</span>
                                    {optimal && (
                                        <span className="flex items-center gap-1 text-[var(--accent-gold)]">
                                            <Sparkles className="h-3 w-3" />
                                            {lift && lift > 0 && <span>+{lift}%</span>}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
