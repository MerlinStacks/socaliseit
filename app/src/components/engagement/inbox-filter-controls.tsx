'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    MessageSquare,
    AtSign,
    Mail,
    Inbox,
    Check,
    Circle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PlatformToggleFilter } from './platform-toggle-filter';
import type { Platform } from '@/lib/platform-config';

interface InboxFilters {
    type: 'all' | 'comment' | 'mention' | 'dm';
    platform: string | null;
    readStatus: 'all' | 'read' | 'unread';
    sentiment: string | null;
}

interface InboxFilterControlsProps {
    filters: InboxFilters;
    onFiltersChange: (filters: InboxFilters) => void;
    /** Show platform toggle filter */
    showPlatformFilter?: boolean;
    /** Show sentiment filter */
    showSentimentFilter?: boolean;
    /** Compact mode for smaller screens */
    compact?: boolean;
}

const TYPE_OPTIONS = [
    { value: 'all', label: 'All', icon: Inbox },
    { value: 'comment', label: 'Comments', icon: MessageSquare },
    { value: 'mention', label: 'Mentions', icon: AtSign },
    { value: 'dm', label: 'Messages', icon: Mail },
] as const;

const READ_OPTIONS = [
    { value: 'all', label: 'All', icon: Inbox },
    { value: 'unread', label: 'Unread', icon: Circle },
    { value: 'read', label: 'Read', icon: Check },
] as const;

const SENTIMENT_OPTIONS = [
    { value: '', label: 'All sentiments' },
    { value: 'positive', label: 'Positive' },
    { value: 'negative', label: 'Negative' },
    { value: 'neutral', label: 'Neutral' },
    { value: 'question', label: 'Question' },
] as const;

/**
 * Type filter buttons (horizontal toggle)
 */
function TypeFilter({
    value,
    onChange,
}: {
    value: InboxFilters['type'];
    onChange: (v: InboxFilters['type']) => void;
}) {
    return (
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
            {TYPE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = value === opt.value;

                return (
                    <button
                        key={opt.value}
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200',
                            isActive
                                ? 'bg-gradient text-white shadow-sm'
                                : 'hover:bg-[var(--bg-secondary)]'
                        )}
                        style={!isActive ? { color: 'var(--text-secondary)' } : undefined}
                        onClick={() => onChange(opt.value)}
                    >
                        <Icon className="h-4 w-4" />
                        <span className="hidden sm:inline">{opt.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

/**
 * Read status filter (toggle or dropdown)
 */
function ReadStatusFilter({
    value,
    onChange,
    compact = false,
}: {
    value: InboxFilters['readStatus'];
    onChange: (v: InboxFilters['readStatus']) => void;
    compact?: boolean;
}) {
    if (compact) {
        return (
            <Select value={value} onValueChange={(v) => onChange(v as InboxFilters['readStatus'])}>
                <SelectTrigger className="w-28">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {READ_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        );
    }

    return (
        <div className="flex items-center gap-1">
            {READ_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = value === opt.value;

                return (
                    <button
                        key={opt.value}
                        className={cn(
                            'flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200',
                            isActive
                                ? 'shadow-sm'
                                : 'hover:bg-[var(--bg-tertiary)]'
                        )}
                        style={{
                            background: isActive ? 'var(--accent-gold-light)' : undefined,
                            color: isActive ? 'var(--accent-gold)' : 'var(--text-secondary)',
                        }}
                        onClick={() => onChange(opt.value)}
                    >
                        <Icon className="h-3.5 w-3.5 mr-1" />
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}

/**
 * Sentiment filter dropdown
 */
function SentimentFilter({
    value,
    onChange,
}: {
    value: string | null;
    onChange: (v: string | null) => void;
}) {
    return (
        <Select value={value || ''} onValueChange={(v) => onChange(v || null)}>
            <SelectTrigger className="w-36" style={{ borderColor: 'var(--border-light)' }}>
                <SelectValue placeholder="Any sentiment" />
            </SelectTrigger>
            <SelectContent>
                {SENTIMENT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex items-center gap-2">
                            {opt.value && (
                                <span
                                    className="w-2 h-2 rounded-full inline-block"
                                    style={{
                                        background:
                                            opt.value === 'positive' ? 'var(--success)' :
                                                opt.value === 'negative' ? 'var(--error)' :
                                                    opt.value === 'neutral' ? 'var(--text-muted)' :
                                                        'var(--accent-gold)'
                                    }}
                                />
                            )}
                            {opt.label}
                        </div>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

/**
 * Main filter controls component
 */
export default function InboxFilterControls({
    filters,
    onFiltersChange,
    showPlatformFilter = true,
    showSentimentFilter = true,
    compact = false,
}: InboxFilterControlsProps) {
    const updateFilter = <K extends keyof InboxFilters>(key: K, value: InboxFilters[K]) => {
        onFiltersChange({ ...filters, [key]: value });
    };

    return (
        <div
            className={cn(
                'flex flex-wrap items-center gap-2 md:gap-3 p-2 md:p-3 border-b glass',
                compact && 'flex-col items-stretch'
            )}
        >
            {/* Type filter - always shown */}
            <TypeFilter
                value={filters.type}
                onChange={(v) => updateFilter('type', v)}
            />

            {/* Platform filter */}
            {showPlatformFilter && (
                <PlatformToggleFilter
                    selected={filters.platform ? [filters.platform as Platform] : []}
                    onChange={(platforms: Platform[]) => {
                        const newPlatform = platforms.length > 0 ? platforms[0] : null;
                        updateFilter('platform', newPlatform);
                    }}
                />
            )}

            {/* Spacer */}
            <div className={cn('flex-1', compact && 'hidden')} />

            {/* Read status filter */}
            <ReadStatusFilter
                value={filters.readStatus}
                onChange={(v) => updateFilter('readStatus', v)}
                compact={compact}
            />

            {/* Sentiment filter - only for comments */}
            {showSentimentFilter && (filters.type === 'all' || filters.type === 'comment') && (
                <SentimentFilter
                    value={filters.sentiment}
                    onChange={(v) => updateFilter('sentiment', v)}
                />
            )}
        </div>
    );
}

/**
 * Export filter types for external use
 */
export type { InboxFilters };
