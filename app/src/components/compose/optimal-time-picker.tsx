/**
 * Optimal Time Picker Component
 * AI-suggested posting times based on audience analytics
 */

'use client';

import { useState } from 'react';
import { Clock, Star, TrendingUp, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimeSlot {
    time: string;
    date: string;
    score: number;
    reason: string;
    audienceActive: number;
}

interface OptimalTimePickerProps {
    platform: string;
    onSelect: (datetime: Date) => void;
    className?: string;
}

export function OptimalTimePicker({ platform, onSelect, className }: OptimalTimePickerProps) {
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

    // Mock optimal times - in production, fetched from analytics
    const suggestedSlots: TimeSlot[] = [
        {
            time: '7:30 PM',
            date: 'Today',
            score: 0.95,
            reason: 'Peak engagement based on your audience',
            audienceActive: 78,
        },
        {
            time: '12:00 PM',
            date: 'Tomorrow',
            score: 0.82,
            reason: 'Lunch break browsing surge',
            audienceActive: 62,
        },
        {
            time: '9:00 AM',
            date: 'Tomorrow',
            score: 0.78,
            reason: 'Morning commute engagement',
            audienceActive: 54,
        },
        {
            time: '6:00 PM',
            date: 'Wed, Jan 29',
            score: 0.75,
            reason: 'Post-work relaxation time',
            audienceActive: 51,
        },
    ];

    const handleSelect = (slot: TimeSlot) => {
        setSelectedSlot(`${slot.date}-${slot.time}`);
        // Parse and create Date object
        const now = new Date();
        const [hours, minutes] = slot.time.replace(' PM', '').replace(' AM', '').split(':').map(Number);
        const isPM = slot.time.includes('PM');
        now.setHours(isPM && hours !== 12 ? hours + 12 : hours, minutes || 0, 0, 0);
        onSelect(now);
    };

    return (
        <div className={cn('space-y-3', className)}>
            <div className="flex items-center gap-2 mb-3">
                <Star className="h-4 w-4 text-[var(--accent-gold)]" />
                <span className="text-sm font-medium">AI-Suggested Times</span>
                <span className="text-xs text-[var(--text-muted)]">for {platform}</span>
            </div>

            {suggestedSlots.map((slot) => {
                const key = `${slot.date}-${slot.time}`;
                const isSelected = selectedSlot === key;

                return (
                    <button
                        key={key}
                        onClick={() => handleSelect(slot)}
                        className={cn(
                            'w-full rounded-lg border-2 p-3 text-left transition-all',
                            isSelected
                                ? 'border-[var(--accent-gold)] bg-[var(--accent-gold-light)]'
                                : 'border-transparent bg-[var(--bg-tertiary)] hover:border-[var(--border)]'
                        )}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-[var(--accent-gold)]" />
                                <span className="font-medium">{slot.time}</span>
                                <span className="text-sm text-[var(--text-muted)]">{slot.date}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="text-sm font-semibold text-[var(--success)]">
                                    +{Math.round((slot.score - 0.5) * 200)}%
                                </span>
                                <TrendingUp className="h-3 w-3 text-[var(--success)]" />
                            </div>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-[var(--text-secondary)]">{slot.reason}</span>
                            <span className="flex items-center gap-1 text-[var(--text-muted)]">
                                <Users className="h-3 w-3" />
                                {slot.audienceActive}% active
                            </span>
                        </div>
                    </button>
                );
            })}

            <button className="w-full rounded-lg border border-dashed border-[var(--border)] p-3 text-sm text-[var(--text-muted)] hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)]">
                + Pick custom time
            </button>
        </div>
    );
}

/**
 * Compact time suggestion badge
 */
interface TimeSuggestionBadgeProps {
    time: string;
    improvement: number;
    onClick?: () => void;
}

export function TimeSuggestionBadge({ time, improvement, onClick }: TimeSuggestionBadgeProps) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-2 text-xs text-[var(--accent-gold)] hover:underline"
        >
            <Star className="h-4 w-4" />
            AI suggests {time} (+{improvement}% reach)
        </button>
    );
}
