'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { showErrorToast } from '@/lib/api-error';

export function AnalyticsControls({ platforms }: { platforms: string[] }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const currentPlatform = searchParams.get('platform') || 'all';
    const currentRange = searchParams.get('range') || '7d';
    const [isSyncing, setIsSyncing] = useState(false);

    const handlePlatformChange = (platform: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (platform === 'all') {
            params.delete('platform');
        } else {
            params.set('platform', platform);
        }
        router.push(`/analytics?${params.toString()}`);
    };

    const handleRangeChange = (range: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('range', range);
        router.push(`/analytics?${params.toString()}`);
    };

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const response = await fetch('/api/analytics/sync', { method: 'POST' });
            if (response.ok) {
                // Refresh the page to show updated data
                router.refresh();
            }
        } catch (error) {
            showErrorToast(error, 'Sync failed');
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="flex items-center gap-3">
            <button
                onClick={handleSync}
                disabled={isSyncing}
                className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none hover:bg-[var(--bg-secondary)] focus:border-[var(--accent-gold)] disabled:opacity-50 transition-colors"
                title="Sync latest metrics from platforms"
            >
                <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
            <select
                value={currentRange}
                onChange={(e) => handleRangeChange(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
            >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="year">This year</option>
            </select>
            <select
                value={currentPlatform}
                onChange={(e) => handlePlatformChange(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
            >
                <option value="all">All Platforms</option>
                {platforms.map(platform => (
                    <option key={platform} value={platform}>
                        {platform.charAt(0).toUpperCase() + platform.slice(1)}
                    </option>
                ))}
            </select>
        </div>
    );
}
