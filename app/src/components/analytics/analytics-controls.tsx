'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export function AnalyticsControls({ platforms }: { platforms: string[] }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const currentPlatform = searchParams.get('platform') || 'all';
    const currentRange = searchParams.get('range') || '7d';

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

    return (
        <div className="flex items-center gap-3">
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
