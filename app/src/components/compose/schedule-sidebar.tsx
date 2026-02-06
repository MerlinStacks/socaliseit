/**
 * Schedule Calendar Sidebar Component
 * Left sidebar for profile selection and scheduling mode toggle.
 */

'use client';

import React, { useState } from 'react';
import { X, Calendar, Clock, Link2, Unlink2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { type SocialAccount } from '@/components/compose/profile-selector';
import { AccountSchedule, platformColors } from './schedule-types';
import { TypeableTimePicker } from './typeable-time-picker';
import { PlatformIcon } from './platform-icons';

interface OptimalTimeSuggestion {
    time: string;
    label: string;
    lift: number;
}

interface ScheduleSidebarProps {
    isUnifiedMode: boolean;
    selectedAccounts: SocialAccount[];
    accountSchedules: Record<string, AccountSchedule>;
    focusedAccountId: string | null;
    unifiedDate: Date;
    unifiedTime: string;
    timezoneAbbr: string;
    /** AI-suggested optimal posting times */
    optimalTimes?: OptimalTimeSuggestion[];
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
    optimalTimes = [],
    onClose,
    onToggleMode,
    onFocusAccount,
    onDateChange,
    onTimeChange,
}: ScheduleSidebarProps) {
    const [showOptimalTimes, setShowOptimalTimes] = useState(false);

    /**
     * Handle unified time change - applies to all accounts
     */
    const handleUnifiedTimeChange = (time: string) => {
        // When unified, the first account ID is used as a proxy for all
        if (selectedAccounts.length > 0) {
            onTimeChange(selectedAccounts[0].id, time);
        }
    };

    /**
     * Handle unified date change - applies to all accounts
     */
    const handleUnifiedDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (selectedAccounts.length > 0) {
            onDateChange(selectedAccounts[0].id, e.target.value);
        }
    };

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

                {/* Unified Mode: Single Card with Platform Icons Row */}
                {isUnifiedMode && selectedAccounts.length > 0 && (
                    <div className="rounded-lg border border-[var(--accent-gold)] ring-1 ring-[var(--accent-gold)] bg-[var(--bg-primary)] p-3">
                        {/* Platform Icons Row */}
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                            {selectedAccounts.map((account) => (
                                <div
                                    key={account.id}
                                    className="relative"
                                    title={`${account.name} (${account.platform})`}
                                >
                                    {/* Profile Avatar */}
                                    <div
                                        className={cn(
                                            'h-8 w-8 rounded-full flex items-center justify-center text-white overflow-hidden',
                                            !account.avatar && (platformColors[account.platform] || 'bg-gray-500')
                                        )}
                                    >
                                        {account.avatar ? (
                                            <img
                                                src={account.avatar}
                                                alt=""
                                                className="h-full w-full rounded-full object-cover"
                                            />
                                        ) : (
                                            <span className="text-xs font-medium">
                                                {account.name.charAt(0).toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    {/* Platform Badge */}
                                    <div
                                        className={cn(
                                            'absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full flex items-center justify-center border border-[var(--bg-primary)]',
                                            platformColors[account.platform] || 'bg-gray-500'
                                        )}
                                    >
                                        <PlatformIcon platform={account.platform} size={10} />
                                    </div>
                                </div>
                            ))}
                            <span className="text-xs text-[var(--text-muted)] ml-1">
                                {selectedAccounts.length} profile{selectedAccounts.length !== 1 ? 's' : ''}
                            </span>
                        </div>

                        {/* Date Selector */}
                        <div className="flex items-center gap-2 mb-3">
                            <div className="flex items-center gap-1 flex-1">
                                <Calendar className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                                <input
                                    type="date"
                                    value={format(unifiedDate, 'yyyy-MM-dd')}
                                    onChange={handleUnifiedDateChange}
                                    className={cn(
                                        'flex-1 rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1 text-xs outline-none',
                                        'focus:border-[var(--accent-gold)]'
                                    )}
                                />
                            </div>
                        </div>

                        {/* Time Selector with Dropdown Picker */}
                        <div className="flex items-center gap-2">
                            <div className="flex-1">
                                <TypeableTimePicker
                                    value={unifiedTime}
                                    onChange={handleUnifiedTimeChange}
                                    optimalTimes={optimalTimes}
                                    showOptimal={showOptimalTimes}
                                    onToggleOptimal={() => setShowOptimalTimes(!showOptimalTimes)}
                                />
                            </div>
                            <span className="text-xs text-[var(--text-muted)]">{timezoneAbbr}</span>
                        </div>

                    </div>
                )}

                {/* Separate Mode: Individual Cards per Account */}
                {!isUnifiedMode && selectedAccounts.map((account) => {
                    const schedule = accountSchedules[account.id] || {
                        date: format(unifiedDate, 'yyyy-MM-dd'),
                        time: unifiedTime,
                    };
                    const isFocused = focusedAccountId === account.id;
                    const displayDate = schedule.date;
                    const displayTime = schedule.time;

                    return (
                        <div
                            key={account.id}
                            onClick={() => onFocusAccount(account.id)}
                            className={cn(
                                'rounded-lg border bg-[var(--bg-primary)] p-3 transition-all cursor-pointer',
                                isFocused
                                    ? 'border-[var(--accent-gold)] ring-1 ring-[var(--accent-gold)]'
                                    : 'border-[var(--border)] hover:border-[var(--accent-gold)]/50'
                            )}
                        >
                            {/* Profile Header */}
                            <div className="flex items-center gap-2 mb-3">
                                <div className="relative">
                                    <div
                                        className={cn(
                                            'h-6 w-6 rounded-full flex items-center justify-center text-white text-xs font-medium overflow-hidden',
                                            !account.avatar && (platformColors[account.platform] || 'bg-gray-500')
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
                                    {/* Platform Badge */}
                                    <div
                                        className={cn(
                                            'absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full flex items-center justify-center border border-[var(--bg-primary)]',
                                            platformColors[account.platform] || 'bg-gray-500'
                                        )}
                                    >
                                        <PlatformIcon platform={account.platform} size={8} />
                                    </div>
                                </div>
                                <span className="text-sm font-medium truncate flex-1">
                                    {account.name}
                                </span>
                                {isFocused && (
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
                                        disabled={!isFocused}
                                        className={cn(
                                            'flex-1 rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1 text-xs outline-none',
                                            'focus:border-[var(--accent-gold)]',
                                            !isFocused && 'opacity-60'
                                        )}
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="flex-1">
                                    <TypeableTimePicker
                                        value={displayTime}
                                        onChange={(time) => onTimeChange(account.id, time)}
                                        optimalTimes={isFocused ? optimalTimes : undefined}
                                        showOptimal={isFocused && showOptimalTimes}
                                        onToggleOptimal={isFocused ? () => setShowOptimalTimes(!showOptimalTimes) : undefined}
                                        disabled={!isFocused}
                                    />
                                </div>
                                <span className="text-xs text-[var(--text-muted)]">{timezoneAbbr}</span>
                            </div>

                            {/* Quick Links */}
                            {isFocused && (
                                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowOptimalTimes(!showOptimalTimes);
                                        }}
                                        className="text-[var(--accent-gold)] hover:underline"
                                    >
                                        {showOptimalTimes ? 'Hide optimal times' : 'Show optimal times'}
                                    </button>
                                </div>
                            )}
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
