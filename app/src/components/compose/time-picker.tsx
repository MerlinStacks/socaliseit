/**
 * TimePicker Component
 * Modern time picker with custom input and quick-select buttons
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Clock, Sparkles } from 'lucide-react';

interface TimePickerProps {
    /** Time value in "HH:MM" 24-hour format */
    value: string;
    /** Callback when time changes */
    onChange: (time: string) => void;
    /** AI-suggested optimal time in "HH:MM" format */
    suggestedTime?: string;
    /** Predicted engagement lift percentage */
    suggestedLift?: number;
    /** Additional CSS classes */
    className?: string;
}

/** Quick-select time presets */
const TIME_PRESETS = [
    { value: '09:00', label: '9 AM' },
    { value: '12:00', label: '12 PM' },
    { value: '15:00', label: '3 PM' },
    { value: '18:00', label: '6 PM' },
    { value: '21:00', label: '9 PM' },
];

/**
 * Format 24-hour time string to 12-hour display
 * Why: Users prefer 12-hour format for readability
 */
function formatTime12Hour(time24: string): string {
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Enhanced time picker with quick presets and custom input
 * Why: Replaces static 6-slot dropdown with flexible time selection
 */
export function TimePicker({
    value,
    onChange,
    suggestedTime,
    suggestedLift,
    className,
}: TimePickerProps) {
    const [showCustomInput, setShowCustomInput] = useState(false);

    /**
     * Check if a preset is currently selected
     */
    const isPresetSelected = useMemo(() => {
        return TIME_PRESETS.some((preset) => preset.value === value);
    }, [value]);

    /**
     * Handle preset button click
     */
    const handlePresetClick = useCallback(
        (presetValue: string) => {
            onChange(presetValue);
            setShowCustomInput(false);
        },
        [onChange]
    );

    /**
     * Handle custom time input change
     */
    const handleCustomTimeChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const newTime = e.target.value;
            if (newTime) {
                onChange(newTime);
            }
        },
        [onChange]
    );

    /**
     * Check if current value matches the AI suggestion
     */
    const isSuggestedSelected = suggestedTime && value === suggestedTime;

    return (
        <div className={cn('flex flex-col gap-2', className)}>
            {/* Quick Preset Buttons */}
            <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-[var(--text-muted)]" />

                {TIME_PRESETS.map((preset) => {
                    const isSelected = value === preset.value;
                    const isSuggested = suggestedTime === preset.value;

                    return (
                        <button
                            key={preset.value}
                            type="button"
                            onClick={() => handlePresetClick(preset.value)}
                            className={cn(
                                'relative rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                                isSelected
                                    ? 'bg-[var(--accent-gold)] text-white'
                                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]',
                                isSuggested && !isSelected && 'ring-1 ring-[var(--accent-gold)]'
                            )}
                        >
                            {preset.label}
                            {isSuggested && !isSelected && (
                                <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-[var(--accent-gold)] text-[8px] text-white">
                                    ✨
                                </span>
                            )}
                        </button>
                    );
                })}

                {/* Custom Time Toggle */}
                <button
                    type="button"
                    onClick={() => setShowCustomInput(!showCustomInput)}
                    className={cn(
                        'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                        showCustomInput || !isPresetSelected
                            ? 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)]'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
                    )}
                >
                    Custom
                </button>
            </div>

            {/* Custom Time Input */}
            {(showCustomInput || !isPresetSelected) && (
                <div className="flex items-center gap-2">
                    <input
                        type="time"
                        value={value}
                        onChange={handleCustomTimeChange}
                        className="rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)] focus:ring-1 focus:ring-[var(--accent-gold)]"
                    />
                    <span className="text-xs text-[var(--text-muted)]">
                        {formatTime12Hour(value)}
                    </span>
                </div>
            )}

            {/* AI Suggestion Badge */}
            {suggestedTime && suggestedLift && !isSuggestedSelected && (
                <button
                    type="button"
                    onClick={() => handlePresetClick(suggestedTime)}
                    className="flex items-center gap-1.5 self-start rounded-lg bg-gradient-to-r from-[var(--accent-gold-light)] to-[var(--accent-pink-light)] px-3 py-1.5 text-xs font-medium text-[var(--accent-gold)] transition-transform hover:scale-105"
                >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>
                        AI suggests {formatTime12Hour(suggestedTime)} (+{suggestedLift}% reach)
                    </span>
                </button>
            )}
        </div>
    );
}
