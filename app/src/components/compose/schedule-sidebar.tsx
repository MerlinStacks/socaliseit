/**
 * Schedule Calendar Sidebar Component
 * Left sidebar for profile selection and scheduling mode toggle.
 */

'use client';

import React from 'react';
import { X, Calendar, Clock, Link2, Unlink2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { type SocialAccount } from '@/components/compose/profile-selector';
import { AccountSchedule, TIME_OPTIONS, platformColors } from './schedule-types';

interface ScheduleSidebarProps {
    isUnifiedMode: boolean;
    selectedAccounts: SocialAccount[];
    accountSchedules: Record<string, AccountSchedule>;
    focusedAccountId: string | null;
    unifiedDate: Date;
    unifiedTime: string;
    timezoneAbbr: string;
    onClose: () => void;
    onToggleMode: () => void;
    onFocusAccount: (accountId: string) => void;
    onDateChange: (accountId: string, date: string) => void;
    onTimeChange: (accountId: string, time: string) => void;
}

/**
 * Sidebar with profile list and scheduling controls.
 */
export function ScheduleSidebar({
    isUnifiedMode,
    selectedAccounts,
    accountSchedules,
    focusedAccountId,
    unifiedDate,
    unifiedTime,
    timezoneAbbr,
    onClose,
    onToggleMode,
    onFocusAccount,
    onDateChange,
    onTimeChange,
}: ScheduleSidebarProps) {
    return (
        <div className="w-[300px] flex-shrink-0 border-r border-[var(--border)] bg-[var(--bg-secondary)] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
                <h2 className="text-lg font-semibold">Publish</h2>
                <button
                    onClick={onClose}
                    className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {/* Scheduling Mode Toggle */}
            <div className="border-b border-[var(--border)] px-4 py-3">
                <button
                    onClick={onToggleMode}
                    className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                        isUnifiedMode
                            ? 'bg-[var(--accent-gold)]/10 text-[var(--accent-gold)]'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    )}
                >
                    {isUnifiedMode ? (
                        <>
                            <Link2 className="h-4 w-4" />
                            <span className="flex-1 text-left">Schedule together</span>
                            <span className="text-xs opacity-70">Click to separate</span>
                        </>
                    ) : (
                        <>
                            <Unlink2 className="h-4 w-4" />
                            <span className="flex-1 text-left">Schedule separately</span>
                            <span className="text-xs opacity-70">Click to unify</span>
                        </>
                    )}
                </button>
            </div>

            {/* Selected Profiles */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                    {isUnifiedMode ? 'Profiles (same time)' : 'Profiles (individual times)'}
                </p>

                {selectedAccounts.map((account) => {
                    const schedule = accountSchedules[account.id] || {
                        date: format(unifiedDate, 'yyyy-MM-dd'),
                        time: unifiedTime,
                    };
                    const isFocused = !isUnifiedMode && focusedAccountId === account.id;
                    const displayDate = isUnifiedMode ? format(unifiedDate, 'yyyy-MM-dd') : schedule.date;
                    const displayTime = isUnifiedMode ? unifiedTime : schedule.time;

                    return (
                        <div
                            key={account.id}
                            onClick={() => !isUnifiedMode && onFocusAccount(account.id)}
                            className={cn(
                                'rounded-lg border bg-[var(--bg-primary)] p-3 transition-all',
                                isFocused
                                    ? 'border-[var(--accent-gold)] ring-1 ring-[var(--accent-gold)]'
                                    : 'border-[var(--border)]',
                                !isUnifiedMode && 'cursor-pointer hover:border-[var(--accent-gold)]/50'
                            )}
                        >
                            {/* Profile Header */}
                            <div className="flex items-center gap-2 mb-3">
                                <div
                                    className={cn(
                                        'h-6 w-6 rounded-full flex items-center justify-center text-white text-xs font-medium',
                                        platformColors[account.platform] || 'bg-gray-500'
                                    )}
                                >
                                    {account.avatar ? (
                                        <img
                                            src={account.avatar}
                                            alt=""
                                            className="h-full w-full rounded-full object-cover"
                                        />
                                    ) : (
                                        account.name.charAt(0).toUpperCase()
                                    )}
                                </div>
                                <span className="text-sm font-medium truncate flex-1">
                                    {account.name}
                                </span>
                                {!isUnifiedMode && isFocused && (
                                    <span className="text-[10px] uppercase tracking-wide text-[var(--accent-gold)]">
                                        Editing
                                    </span>
                                )}
                            </div>

                            {/* Date/Time Selectors */}
                            <div className="flex items-center gap-2 mb-2">
                                <div className="flex items-center gap-1 flex-1">
                                    <Calendar className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                                    <input
                                        type="date"
                                        value={displayDate}
                                        onChange={(e) => onDateChange(account.id, e.target.value)}
                                        disabled={!isUnifiedMode && !isFocused}
                                        className={cn(
                                            'flex-1 rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1 text-xs outline-none',
                                            'focus:border-[var(--accent-gold)]',
                                            !isUnifiedMode && !isFocused && 'opacity-60'
                                        )}
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1 flex-1">
                                    <Clock className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                                    <select
                                        value={displayTime}
                                        onChange={(e) => onTimeChange(account.id, e.target.value)}
                                        disabled={!isUnifiedMode && !isFocused}
                                        className={cn(
                                            'flex-1 rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1 text-xs outline-none',
                                            'focus:border-[var(--accent-gold)]',
                                            !isUnifiedMode && !isFocused && 'opacity-60'
                                        )}
                                    >
                                        {TIME_OPTIONS.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <span className="text-xs text-[var(--text-muted)]">{timezoneAbbr}</span>
                            </div>

                            {/* Quick Links */}
                            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                                <button className="text-[var(--accent-gold)] hover:underline">
                                    Show optimal times
                                </button>
                            </div>
                        </div>
                    );
                })}

                {selectedAccounts.length === 0 && (
                    <div className="text-center py-8 text-[var(--text-muted)] text-sm">
                        No profiles selected
                    </div>
                )}
            </div>
        </div>
    );
}
