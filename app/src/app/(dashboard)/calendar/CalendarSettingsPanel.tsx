/**
 * Calendar Settings Panel
 * Gear-icon dropdown providing Vista Social-style calendar display options:
 * post preview, week start, holidays, and visibility toggles.
 *
 * Why: Gives users granular control over calendar visuals in one place,
 * reading/writing the shared Zustand CalendarSettings store.
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { Settings, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    useCalendarSettingsStore,
    type PostPreviewMode,
    type WeekStartDay,
} from '@/lib/stores/calendar-settings-store';
import {
    NATIONAL_HOLIDAY_OPTIONS,
    RELIGIOUS_HOLIDAY_OPTIONS,
} from '@/lib/holidays';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Radio option row */
function RadioRow({
    label, selected, onSelect, testId,
}: {
    label: string; selected: boolean; onSelect: () => void; testId: string;
}) {
    return (
        <button
            data-testid={testId}
            onClick={onSelect}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-[var(--bg-tertiary)] transition-colors"
        >
            <span className={cn(
                'h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                selected ? 'border-[var(--accent-gold)]' : 'border-[var(--text-muted)]/40'
            )}>
                {selected && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-gold)]" />}
            </span>
            <span className={cn(selected && 'font-medium')}>{label}</span>
        </button>
    );
}

/** Checkbox toggle row */
function CheckboxRow({
    label, checked, onChange, testId,
}: {
    label: string; checked: boolean; onChange: () => void; testId: string;
}) {
    return (
        <button
            data-testid={testId}
            onClick={onChange}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-[var(--bg-tertiary)] transition-colors"
        >
            <span className={cn(
                'h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
                checked
                    ? 'bg-[var(--accent-gold)] border-[var(--accent-gold)]'
                    : 'border-[var(--text-muted)]/40'
            )}>
                {checked && (
                    <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M2 6l3 3 5-5" />
                    </svg>
                )}
            </span>
            <span>{label}</span>
        </button>
    );
}

/** Tag pill for selected holiday options */
function TagPill({ label, onRemove }: { label: string; onRemove: () => void }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-gold)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--accent-gold)]">
            {label}
            <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="hover:text-red-400 transition-colors">
                <X className="h-3 w-3" />
            </button>
        </span>
    );
}

/** Multi-select dropdown for holiday categories */
function HolidaySelect({
    label,
    options,
    selected,
    onToggle,
    testId,
}: {
    label: string;
    options: readonly { code: string; label: string }[];
    selected: string[];
    onToggle: (code: string) => void;
    testId: string;
}) {
    const [open, setOpen] = useState(false);

    return (
        <div className="px-3">
            <p className="text-xs font-medium text-[var(--text-muted)] mb-1.5">{label}</p>
            <div className="relative">
                <button
                    data-testid={testId}
                    onClick={() => setOpen(!open)}
                    className={cn(
                        'w-full flex items-center justify-between rounded-lg border px-3 py-2 text-sm',
                        'border-[var(--border)] bg-[var(--bg-primary)] hover:border-[var(--accent-gold)]/50',
                        'transition-colors'
                    )}
                >
                    <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                        {selected.length === 0 ? (
                            <span className="text-[var(--text-muted)]">Select {label.toLowerCase()}</span>
                        ) : (
                            selected.map((code) => {
                                const opt = options.find((o) => o.code === code);
                                return opt ? (
                                    <TagPill key={code} label={opt.label} onRemove={() => onToggle(code)} />
                                ) : null;
                            })
                        )}
                    </div>
                    <ChevronDown className={cn('h-4 w-4 text-[var(--text-muted)] transition-transform', open && 'rotate-180')} />
                </button>

                {open && (
                    <div className="absolute z-50 mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] shadow-lg py-1">
                        {options.map((opt) => (
                            <CheckboxRow
                                key={opt.code}
                                label={opt.label}
                                checked={selected.includes(opt.code)}
                                onChange={() => onToggle(opt.code)}
                                testId={`${testId}-${opt.code}`}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Section divider
// ---------------------------------------------------------------------------

function Divider() {
    return <div className="my-2 border-b border-[var(--border)]" />;
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export function CalendarSettingsPanel() {
    const [isOpen, setIsOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    const {
        postPreview, weekStartsOn,
        nationalHolidays, religiousHolidays, showFunHolidays,
        showNotes, showExternalPosts,
        update, toggleNationalHoliday, toggleReligiousHoliday,
    } = useCalendarSettingsStore();

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen]);

    const previewOptions: { value: PostPreviewMode; label: string }[] = [
        { value: 'none', label: 'Without preview' },
        { value: 'small', label: 'Small preview' },
        { value: 'large', label: 'Large preview' },
        { value: 'condensed', label: 'Condensed view' },
    ];

    return (
        <div className="relative" ref={panelRef}>
            {/* Trigger button */}
            <button
                data-testid="calendar-settings-btn"
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    'inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition-all',
                    'border-[var(--border)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]',
                    isOpen && 'ring-2 ring-[var(--accent-gold)]/30'
                )}
                title="Calendar settings"
            >
                <Settings className="h-4 w-4" />
            </button>

            {/* Dropdown panel */}
            {isOpen && (
                <div
                    data-testid="calendar-settings-panel"
                    className={cn(
                        'absolute right-0 top-full mt-2 z-50 w-80 rounded-xl py-3',
                        'border border-[var(--border)] shadow-xl',
                        'bg-[var(--bg-secondary)] backdrop-blur-xl',
                        'animate-in fade-in slide-in-from-top-2 duration-200'
                    )}
                >
                    {/* Post preview */}
                    <div className="px-3 mb-1">
                        <p className="text-xs font-medium text-[var(--text-muted)] mb-1">Post preview</p>
                    </div>
                    {previewOptions.map((opt) => (
                        <RadioRow
                            key={opt.value}
                            label={opt.label}
                            selected={postPreview === opt.value}
                            onSelect={() => update({ postPreview: opt.value })}
                            testId={`preview-${opt.value}`}
                        />
                    ))}

                    <Divider />

                    {/* Week starts on */}
                    <div className="px-3 mb-1">
                        <p className="text-xs font-medium text-[var(--text-muted)] mb-1">Week day starts on</p>
                    </div>
                    {([{ value: 0 as WeekStartDay, label: 'Sunday' }, { value: 1 as WeekStartDay, label: 'Monday' }]).map((opt) => (
                        <RadioRow
                            key={opt.value}
                            label={opt.label}
                            selected={weekStartsOn === opt.value}
                            onSelect={() => update({ weekStartsOn: opt.value })}
                            testId={`weekstart-${opt.label.toLowerCase()}`}
                        />
                    ))}

                    <Divider />

                    {/* National holidays */}
                    <HolidaySelect
                        label="National holidays"
                        options={NATIONAL_HOLIDAY_OPTIONS}
                        selected={nationalHolidays}
                        onToggle={toggleNationalHoliday}
                        testId="national-holidays"
                    />

                    {/* Religious holidays */}
                    <div className="mt-2">
                        <HolidaySelect
                            label="Religious holidays"
                            options={RELIGIOUS_HOLIDAY_OPTIONS}
                            selected={religiousHolidays}
                            onToggle={toggleReligiousHoliday}
                            testId="religious-holidays"
                        />
                    </div>

                    <Divider />

                    {/* Toggle switches */}
                    <CheckboxRow
                        label="Fun holidays"
                        checked={showFunHolidays}
                        onChange={() => update({ showFunHolidays: !showFunHolidays })}
                        testId="toggle-fun-holidays"
                    />
                    <CheckboxRow
                        label="Show external posts"
                        checked={showExternalPosts}
                        onChange={() => update({ showExternalPosts: !showExternalPosts })}
                        testId="toggle-external-posts"
                    />
                    <CheckboxRow
                        label="Show notes"
                        checked={showNotes}
                        onChange={() => update({ showNotes: !showNotes })}
                        testId="toggle-show-notes"
                    />
                </div>
            )}
        </div>
    );
}
