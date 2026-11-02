'use client';

/**
 * Slot editor for one publishing queue.
 *
 * Mirrors how comparable tools present a queue: a list of recurring lines, each
 * a time plus the days it fires on, with add/remove/edit in place. Days are
 * toggled rather than typed because "Mon, Wed, Fri" is what people think in.
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Plus } from 'lucide-react';
import { DAY_LABELS, type QueueSlot } from './client';

interface Props {
    slots: QueueSlot[];
    onChange: (slots: QueueSlot[]) => void;
    disabled?: boolean;
}

export function QueueSlotEditor({ slots, onChange, disabled }: Props) {
    function update(index: number, patch: Partial<QueueSlot>) {
        onChange(slots.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
    }

    function toggleDay(index: number, day: number) {
        const current = slots[index].daysOfWeek;
        const next = current.includes(day) ? current.filter(d => d !== day) : [...current, day].sort();
        update(index, { daysOfWeek: next });
    }

    return (
        <div className="space-y-3">
            {slots.map((slot, index) => (
                <div key={slot.id ?? index} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] p-3">
                    <div className="flex gap-1" role="group" aria-label="Days this slot repeats on">
                        {DAY_LABELS.map((label, day) => {
                            const active = slot.daysOfWeek.includes(day);
                            return (
                                <button
                                    key={day}
                                    type="button"
                                    disabled={disabled}
                                    aria-pressed={active}
                                    onClick={() => toggleDay(index, day)}
                                    title={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]}
                                    className={`h-8 w-8 rounded-lg text-xs font-semibold transition-colors ${active
                                        ? 'bg-[var(--accent-gold)] text-[var(--bg-primary)]'
                                        : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]'
                                        }`}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>

                    <Input
                        type="time"
                        value={slot.time}
                        disabled={disabled}
                        onChange={event => update(index, { time: event.target.value })}
                        className="w-32"
                        aria-label={`Time for slot ${index + 1}`}
                    />

                    <span className="text-xs text-[var(--text-muted)]">
                        {slot.daysOfWeek.length === 0 ? 'Pick at least one day' : `${slot.daysOfWeek.length} day${slot.daysOfWeek.length === 1 ? '' : 's'}`}
                    </span>

                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={disabled || slots.length === 1}
                        onClick={() => onChange(slots.filter((_, i) => i !== index))}
                        aria-label={`Remove slot ${index + 1}`}
                        className="ml-auto text-[var(--text-muted)] hover:text-[var(--error)]"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            ))}

            <Button
                type="button"
                variant="secondary"
                disabled={disabled}
                onClick={() => onChange([...slots, { daysOfWeek: [1, 2, 3, 4, 5], time: '09:00' }])}
            >
                <Plus className="mr-2 h-4 w-4" /> Add a slot
            </Button>
        </div>
    );
}
