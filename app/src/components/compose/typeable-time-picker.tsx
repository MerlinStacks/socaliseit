/**
 * Typeable Time Picker Component
 * Hybrid time picker with direct text input AND dropdown quick-select.
 * 
 * Why: Users often want to type exact times like "9:43 AM" rather than
 * selecting from dropdowns. This component allows both approaches.
 */

'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, Sparkles } from 'lucide-react';

interface OptimalTimeSuggestion {
    time: string;
    label: string;
    lift: number;
}

interface TypeableTimePickerProps {
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
    /** Compact mode - hide text input, show only dropdowns (for inline layouts) */
    compact?: boolean;
    /** Additional CSS classes */
    className?: string;
}

/**
 * Parse 24-hour time to 12-hour components
 */
function parse24HourTime(time24: string): { hour12: number; minute: number; period: 'AM' | 'PM' } {
    const [hours, minutes] = time24.split(':').map(Number);
    const period: 'AM' | 'PM' = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return { hour12, minute: minutes, period };
}

/**
 * Convert 12-hour components to 24-hour time string
 */
function to24HourTime(hour12: number, minute: number, period: 'AM' | 'PM'): string {
    let hour24 = hour12;
    if (period === 'AM' && hour12 === 12) {
        hour24 = 0;
    } else if (period === 'PM' && hour12 !== 12) {
        hour24 = hour12 + 12;
    }
    return `${hour24.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

/**
 * Format 24-hour time to 12-hour display string
 */
function formatTime12Hour(time24: string): string {
    const { hour12, minute, period } = parse24HourTime(time24);
    return `${hour12}:${minute.toString().padStart(2, '0')} ${period}`;
}

/**
 * Parse user input to 24-hour time format
 * Supports: "9:43 AM", "9:43am", "943am", "14:30", "1430"
 */
function parseTimeInput(input: string): string | null {
    const cleanInput = input.trim().toUpperCase().replace(/\s+/g, ' ');

    // Try "H:MM AM" or "HH:MM AM" format
    const match12Colon = cleanInput.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
    if (match12Colon) {
        let hour = parseInt(match12Colon[1], 10);
        const minute = parseInt(match12Colon[2], 10);
        const period = match12Colon[3] as 'AM' | 'PM' | undefined;

        if (minute < 0 || minute > 59) return null;

        if (period) {
            if (hour < 1 || hour > 12) return null;
            return to24HourTime(hour, minute, period);
        } else {
            // Assume 24-hour format
            if (hour < 0 || hour > 23) return null;
            return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        }
    }

    // Try "HMMAM" or "HHMMAM" format (no colon)
    const matchNoColon = cleanInput.match(/^(\d{1,2})(\d{2})\s*(AM|PM)?$/);
    if (matchNoColon) {
        let hour = parseInt(matchNoColon[1], 10);
        const minute = parseInt(matchNoColon[2], 10);
        const period = matchNoColon[3] as 'AM' | 'PM' | undefined;

        if (minute < 0 || minute > 59) return null;

        if (period) {
            if (hour < 1 || hour > 12) return null;
            return to24HourTime(hour, minute, period);
        } else {
            // Assume 24-hour format
            if (hour < 0 || hour > 23) return null;
            return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        }
    }

    // Try just "H AM" or "HH AM" (hour only, assume :00)
    const matchHourOnly = cleanInput.match(/^(\d{1,2})\s*(AM|PM)$/);
    if (matchHourOnly) {
        const hour = parseInt(matchHourOnly[1], 10);
        const period = matchHourOnly[2] as 'AM' | 'PM';

        if (hour < 1 || hour > 12) return null;
        return to24HourTime(hour, 0, period);
    }

    return null;
}

/**
 * Generate hour options (1-12)
 */
function generateHourOptions(): Array<{ value: number; label: string }> {
    return Array.from({ length: 12 }, (_, i) => {
        const hour = i === 0 ? 12 : i;
        return { value: hour, label: hour.toString() };
    });
}

/**
 * Generate minute options (00-59)
 */
function generateMinuteOptions(): Array<{ value: number; label: string }> {
    return Array.from({ length: 60 }, (_, i) => ({
        value: i,
        label: i.toString().padStart(2, '0'),
    }));
}

const HOUR_OPTIONS = generateHourOptions();
const MINUTE_OPTIONS = generateMinuteOptions();

interface MiniDropdownProps {
    value: string;
    options: Array<{ value: string | number; label: string }>;
    onChange: (value: string) => void;
    disabled?: boolean;
    className?: string;
    ariaLabel?: string;
}

/**
 * Compact inline dropdown
 */
function MiniDropdown({ value, options, onChange, disabled, className, ariaLabel }: MiniDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

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

    const selectedLabel = options.find((o) => o.value.toString() === value)?.label || value;

    return (
        <div ref={containerRef} className={cn('relative', className)}>
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                aria-label={ariaLabel}
                aria-expanded={isOpen}
                className={cn(
                    'flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium transition-colors',
                    'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)]',
                    disabled && 'opacity-50 cursor-not-allowed'
                )}
            >
                <span>{selectedLabel}</span>
                <ChevronDown className={cn('h-3 w-3 opacity-50', isOpen && 'rotate-180')} />
            </button>

            {isOpen && !disabled && (
                <div className="absolute top-full left-0 z-50 mt-1 max-h-40 min-w-[50px] overflow-y-auto rounded border border-[var(--border)] bg-[var(--bg-secondary)] shadow-lg">
                    {options.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                                onChange(option.value.toString());
                                setIsOpen(false);
                            }}
                            className={cn(
                                'flex w-full items-center px-2 py-1 text-xs transition-colors',
                                option.value.toString() === value
                                    ? 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)] font-medium'
                                    : 'hover:bg-[var(--bg-tertiary)]'
                            )}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Typeable time picker with hybrid text input + dropdowns
 */
export function TypeableTimePicker({
    value,
    onChange,
    optimalTimes = [],
    showOptimal = false,
    onToggleOptimal,
    disabled = false,
    compact = false,
    className,
}: TypeableTimePickerProps) {
    const { hour12, minute, period } = useMemo(() => parse24HourTime(value), [value]);
    const [inputValue, setInputValue] = useState(() => formatTime12Hour(value));
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync input value when external value changes (but not while focused/typing)
    useEffect(() => {
        if (!isFocused) {
            setInputValue(formatTime12Hour(value));
        }
    }, [value, isFocused]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setInputValue(newValue);

        // Try to parse as we type
        const parsed = parseTimeInput(newValue);
        if (parsed) {
            onChange(parsed);
        }
    }, [onChange]);

    const handleInputBlur = useCallback(() => {
        setIsFocused(false);
        // On blur, validate and reset if invalid
        const parsed = parseTimeInput(inputValue);
        if (parsed) {
            onChange(parsed);
            setInputValue(formatTime12Hour(parsed));
        } else {
            // Reset to current valid value
            setInputValue(formatTime12Hour(value));
        }
    }, [inputValue, value, onChange]);

    const handleInputFocus = useCallback(() => {
        setIsFocused(true);
        // Select all text for easy replacement
        setTimeout(() => inputRef.current?.select(), 0);
    }, []);

    const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleInputBlur();
            inputRef.current?.blur();
        }
    }, [handleInputBlur]);

    const handleHourChange = useCallback((newHour: string) => {
        const time24 = to24HourTime(parseInt(newHour, 10), minute, period);
        onChange(time24);
    }, [minute, period, onChange]);

    const handleMinuteChange = useCallback((newMinute: string) => {
        const time24 = to24HourTime(hour12, parseInt(newMinute, 10), period);
        onChange(time24);
    }, [hour12, period, onChange]);

    const handlePeriodChange = useCallback((newPeriod: string) => {
        const time24 = to24HourTime(hour12, minute, newPeriod as 'AM' | 'PM');
        onChange(time24);
    }, [hour12, minute, onChange]);

    const handleOptimalTimeClick = useCallback((time: string) => {
        onChange(time);
    }, [onChange]);

    const isOptimalTime = useMemo(
        () => optimalTimes.some((opt) => opt.time === value),
        [optimalTimes, value]
    );

    return (
        <div className={cn('flex flex-col gap-2', className)}>
            {/* Main Input Row */}
            <div className="flex items-center gap-1.5">
                {/* Text Input - Primary way to type time (hidden in compact mode) */}
                {!compact && (
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={handleInputChange}
                        onBlur={handleInputBlur}
                        onFocus={handleInputFocus}
                        onKeyDown={handleInputKeyDown}
                        disabled={disabled}
                        placeholder="9:00 AM"
                        className={cn(
                            'w-[90px] rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1.5 text-xs font-medium outline-none transition-colors',
                            'focus:border-[var(--accent-gold)] focus:ring-1 focus:ring-[var(--accent-gold)]',
                            disabled && 'opacity-50 cursor-not-allowed'
                        )}
                    />
                )}

                {/* Quick-adjust dropdowns */}
                <div className="flex items-center gap-0.5 text-[var(--text-muted)]">
                    <MiniDropdown
                        value={hour12.toString()}
                        options={HOUR_OPTIONS.map((o) => ({ value: o.value.toString(), label: o.label }))}
                        onChange={handleHourChange}
                        disabled={disabled}
                        ariaLabel="Select hour"
                    />
                    <span className="text-xs">:</span>
                    <MiniDropdown
                        value={minute.toString()}
                        options={MINUTE_OPTIONS.map((o) => ({ value: o.value.toString(), label: o.label }))}
                        onChange={handleMinuteChange}
                        disabled={disabled}
                        ariaLabel="Select minute"
                    />
                    <MiniDropdown
                        value={period}
                        options={[
                            { value: 'AM', label: 'AM' },
                            { value: 'PM', label: 'PM' },
                        ]}
                        onChange={handlePeriodChange}
                        disabled={disabled}
                        ariaLabel="Select AM or PM"
                    />
                </div>

                {/* Optimal time indicator */}
                {isOptimalTime && (
                    <Sparkles className="h-3.5 w-3.5 text-[var(--accent-gold)]" />
                )}
            </div>

            {/* Optimal Times Section */}
            {showOptimal && optimalTimes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {optimalTimes.map((opt) => (
                        <button
                            key={opt.time}
                            type="button"
                            onClick={() => handleOptimalTimeClick(opt.time)}
                            disabled={disabled}
                            className={cn(
                                'flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors',
                                value === opt.time
                                    ? 'bg-[var(--accent-gold)] text-white'
                                    : 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)] hover:bg-[var(--accent-gold)] hover:text-white',
                                disabled && 'opacity-50 cursor-not-allowed'
                            )}
                        >
                            <Sparkles className="h-3 w-3" />
                            <span>{opt.label}</span>
                            {opt.lift > 0 && <span className="opacity-80">+{opt.lift}%</span>}
                        </button>
                    ))}
                </div>
            )}

            {/* Toggle Optimal Times Link */}
            {onToggleOptimal && optimalTimes.length > 0 && !showOptimal && (
                <button
                    type="button"
                    onClick={onToggleOptimal}
                    disabled={disabled}
                    className="flex items-center gap-1 text-xs text-[var(--accent-gold)] hover:underline"
                >
                    <Sparkles className="h-3 w-3" />
                    Show optimal times
                </button>
            )}
        </div>
    );
}
