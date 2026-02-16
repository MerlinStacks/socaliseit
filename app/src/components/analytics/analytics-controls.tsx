/**
 * Analytics Controls — Redesigned Filter Bar
 * Horizontal bar with platform pill buttons, time period selector, sync + export.
 *
 * Why: Replace plain <select> dropdowns with a visually prominent, always-visible
 * filter row that makes platform switching feel instant and discoverable.
 */

'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw, Download } from 'lucide-react';
import { showErrorToast } from '@/lib/api-error';
import { cn } from '@/lib/utils';

/** Map platform keys to display labels and accent colours */
const PLATFORM_META: Record<string, { label: string; color: string }> = {
    instagram: { label: 'Instagram', color: 'bg-gradient-to-r from-purple-500 to-pink-500' },
    facebook: { label: 'Facebook', color: 'bg-blue-600' },
    tiktok: { label: 'TikTok', color: 'bg-gray-900 dark:bg-white dark:text-gray-900' },
    youtube: { label: 'YouTube', color: 'bg-red-600' },
    pinterest: { label: 'Pinterest', color: 'bg-red-500' },
    linkedin: { label: 'LinkedIn', color: 'bg-blue-700' },
    twitter: { label: 'Twitter', color: 'bg-sky-500' },
    bluesky: { label: 'Bluesky', color: 'bg-blue-500' },
    google_business: { label: 'Google', color: 'bg-emerald-600' },
};

const TIME_RANGES = [
    { value: '7d', label: '7 days' },
    { value: '30d', label: '30 days' },
    { value: '90d', label: '90 days' },
    { value: 'year', label: 'This year' },
];

interface AnalyticsControlsProps {
    platforms: string[];
    onExport: () => void;
}

/**
 * Renders the horizontal filter bar with platform pills, time picker, sync + export.
 */
export function AnalyticsControls({ platforms, onExport }: AnalyticsControlsProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const currentPlatform = searchParams.get('platform') || 'all';
    const currentRange = searchParams.get('range') || '7d';
    const [isSyncing, setIsSyncing] = useState(false);

    const navigate = (key: string, value: string | null) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value === null) {
            params.delete(key);
        } else {
            params.set(key, value);
        }
        router.push(`/analytics?${params.toString()}`);
    };

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const response = await fetch('/api/analytics/sync', { method: 'POST' });
            if (response.ok) {
                router.refresh();
            }
        } catch (error) {
            showErrorToast(error, 'Sync failed');
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/80 backdrop-blur-lg px-4 py-2.5 mb-6">
            {/* Platform Pills */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                <PlatformPill
                    label="All"
                    isActive={currentPlatform === 'all'}
                    onClick={() => navigate('platform', null)}
                />
                {platforms.map(p => {
                    const meta = PLATFORM_META[p];
                    return (
                        <PlatformPill
                            key={p}
                            label={meta?.label || p.charAt(0).toUpperCase() + p.slice(1)}
                            activeColor={meta?.color}
                            isActive={currentPlatform === p}
                            onClick={() => navigate('platform', p)}
                        />
                    );
                })}
            </div>

            {/* Right side: Time + Sync + Export */}
            <div className="flex items-center gap-2 flex-shrink-0">
                {/* Time Period */}
                <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-0.5">
                    {TIME_RANGES.map(r => (
                        <button
                            key={r.value}
                            onClick={() => navigate('range', r.value)}
                            className={cn(
                                'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                                currentRange === r.value
                                    ? 'bg-[var(--accent-gold)] text-white shadow-sm'
                                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            )}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>

                {/* Sync */}
                <button
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-xs font-medium hover:bg-[var(--bg-secondary)] disabled:opacity-50 transition-colors"
                    title="Sync latest metrics from platforms"
                >
                    <RefreshCw className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')} />
                    {isSyncing ? 'Syncing…' : 'Sync'}
                </button>

                {/* Export */}
                <button
                    onClick={onExport}
                    className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-xs font-medium hover:bg-[var(--bg-secondary)] transition-colors"
                    title="Export analytics report"
                >
                    <Download className="h-3.5 w-3.5" />
                    Export
                </button>
            </div>
        </div>
    );
}

/** Individual platform pill toggle */
function PlatformPill({
    label,
    isActive,
    activeColor,
    onClick,
}: {
    label: string;
    isActive: boolean;
    activeColor?: string;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200',
                isActive
                    ? `${activeColor || 'bg-[var(--accent-gold)]'} text-white shadow-md scale-105`
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)] border border-[var(--border)]'
            )}
        >
            {label}
        </button>
    );
}
