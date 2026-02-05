/**
 * Dropdown Time Picker Component
 * Vista Social-style time picker with discrete Hour/Minute/AM-PM dropdowns.
 * Why: Provides a cleaner, more intuitive time selection experience than scrollable lists.
 */

'use client';

import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, Sparkles } from 'lucide-react';

interface OptimalTimeSuggestion {
    time: string;
    label: string;
    lift: number;
}

interface DropdownTimePickerProps {
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
 * Generate hour options (1-12)
 */
function generateHourOptions(): Array<{ value: number; label: string }> {
    return Array.from({ length: 12 }, (_, i) => {
        const hour = i === 0 ? 12 : i;
        return { value: hour, label: hour.toString().padStart(2, '0') };
    });
}

/**
 * Generate minute options (00-59)
 */
function generateMinuteOptions(): Array<{ value: number; label: string }> {
    return Array.from({ length: 60 }, (_, i) => {
        return { value: i, label: i.toString().padStart(2, '0') };
    });
}

const HOUR_OPTIONS = generateHourOptions();
const MINUTE_OPTIONS = generateMinuteOptions();

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

interface DropdownProps {
    value: string;
    options: Array<{ value: string | number; label: string }>;
    onChange: (value: string) => void;
    disabled?: boolean;
    className?: string;
    ariaLabel?: string;
}

/**
 * Compact dropdown select component
 */
function Dropdown({ value, options, onChange, disabled, className, ariaLabel }: DropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

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
                    'flex items-center justify-between gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1.5 text-xs font-medium transition-colors',
                    'hover:border-[var(--accent-gold)] focus:border-[var(--accent-gold)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-gold)]',
                    disabled && 'opacity-50 cursor-not-allowed'
                )}
            >
                <span>{selectedLabel}</span>
                <ChevronDown className={cn('h-3 w-3 transition-transform', isOpen && 'rotate-180')} />
            </button>

            {isOpen && !disabled && (
                <div className="absolute top-full left-0 z-50 mt-1 max-h-48 min-w-full overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] shadow-lg">
                    {options.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                                onChange(option.value.toString());
                                setIsOpen(false);
                            }}
                            className={cn(
                                'flex w-full items-center px-3 py-1.5 text-xs transition-colors',
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
 * Vista Social-style time picker with discrete dropdowns for Hour, Minute, and AM/PM
 */
export function DropdownTimePicker({
    value,
    onChange,
    optimalTimes = [],
    showOptimal = false,
    onToggleOptimal,
    disabled = false,
    className,
}: DropdownTimePickerProps) {
    const { hour12, minute, period } = useMemo(() => parse24HourTime(value), [value]);

    const handleHourChange = useCallback(
        (newHour: string) => {
            const time24 = to24HourTime(parseInt(newHour, 10), minute, period);
            onChange(time24);
        },
        [minute, period, onChange]
    );

    const handleMinuteChange = useCallback(
        (newMinute: string) => {
            const time24 = to24HourTime(hour12, parseInt(newMinute, 10), period);
            onChange(time24);
        },
        [hour12, period, onChange]
    );

    const handlePeriodChange = useCallback(
        (newPeriod: string) => {
            const time24 = to24HourTime(hour12, minute, newPeriod as 'AM' | 'PM');
            onChange(time24);
        },
        [hour12, minute, onChange]
    );

    const handleOptimalTimeClick = useCallback(
        (time: string) => {
            onChange(time);
        },
        [onChange]
    );

    // Check if current time is an optimal time
    const isOptimalTime = useMemo(
        () => optimalTimes.some((opt) => opt.time === value),
        [optimalTimes, value]
    );

    return (
        <div className={cn('flex flex-col gap-2', className)}>
            {/* Time Dropdowns Row */}
            <div className="flex items-center gap-1.5">
                {/* Hour Dropdown */}
                <Dropdown
                    value={hour12.toString()}
                    options={HOUR_OPTIONS.map((o) => ({ value: o.value.toString(), label: o.label }))}
                    onChange={handleHourChange}
                    disabled={disabled}
                    className="w-[52px]"
                    ariaLabel="Select hour"
                />

                <span className="text-[var(--text-muted)] font-medium">:</span>

                {/* Minute Dropdown */}
                <Dropdown
                    value={minute.toString()}
                    options={MINUTE_OPTIONS.map((o) => ({ value: o.value.toString(), label: o.label }))}
                    onChange={handleMinuteChange}
                    disabled={disabled}
                    className="w-[52px]"
                    ariaLabel="Select minute"
                />

                {/* AM/PM Dropdown */}
                <Dropdown
                    value={period}
                    options={[
                        { value: 'AM', label: 'AM' },
                        { value: 'PM', label: 'PM' },
                    ]}
                    onChange={handlePeriodChange}
                    disabled={disabled}
                    className="w-[54px]"
                    ariaLabel="Select AM or PM"
                />

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
