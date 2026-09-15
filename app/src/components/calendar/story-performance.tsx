'use client';

import { format } from 'date-fns';

interface StoryAnalytics {
    impressions: number;
    reach: number;
    comments: number;
    syncedAt: string | null;
    platformMetrics?: unknown;
}

/** Why: Legacy snapshots stored missing metrics as zero. Only explicit values
 * from the story adapter can establish that a zero was actually reported. */
export function getStoryMetrics(platform: string, analytics?: StoryAnalytics | null) {
    const metadata = analytics?.platformMetrics;
    const raw = metadata && typeof metadata === 'object' && 'storyMetrics' in metadata
        ? metadata.storyMetrics : undefined;
    const definitions = platform.toLowerCase() === 'facebook'
        ? [{ key: 'reach', label: 'Reach', description: 'Unique people who saw your story.', legacy: analytics?.reach }]
        : [
            { key: 'views', label: 'Views', description: 'Times your story was viewed.', legacy: analytics?.impressions },
            { key: 'reach', label: 'Reach', description: 'Unique people who saw your story.', legacy: analytics?.reach },
            { key: 'replies', label: 'Replies', description: 'Replies sent to your story.', legacy: analytics?.comments },
        ];

    return definitions.map(({ legacy, ...metric }) => {
        const explicit = raw && typeof raw === 'object'
            ? (raw as Record<string, unknown>)[metric.key] : undefined;
        const value = raw === undefined ? (legacy && legacy > 0 ? legacy : undefined) : explicit;
        return { ...metric, value: typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null };
    });
}

/** Story insights are a captured snapshot, not a promise of lifetime API access. */
export function StoryPerformance({ platform, analytics }: { platform: string; analytics?: StoryAnalytics | null }) {
    const metrics = getStoryMetrics(platform, analytics);
    const hasData = metrics.some(metric => metric.value !== null);
    return (
        <section className="border-t border-[var(--border)] px-5 py-4" aria-label="Story performance">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Story performance</h3>
            {hasData && analytics?.syncedAt && (
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Last captured {format(new Date(analytics.syncedAt), 'MMM d, yyyy h:mm a')}
                </p>
            )}
            {hasData ? (
                <div className="mt-4 grid grid-cols-2 gap-3">
                    {metrics.map(metric => (
                        <div key={metric.key} className="rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/50 p-4">
                            <p className="text-sm font-medium">{metric.label}</p>
                            <p className="mt-1 text-xs text-[var(--text-muted)]">{metric.description}</p>
                            <p className="mt-3 text-xl font-bold">{metric.value === null ? 'Unavailable' : metric.value.toLocaleString()}</p>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="mt-3 text-sm font-medium">Story insights unavailable</p>
            )}
            <p className="mt-3 text-xs text-[var(--text-muted)]">
                {hasData ? 'Only metrics returned by the platform are shown. ' : 'We don’t have verified metrics for this story. This does not mean nobody saw it. '}
                Stories normally disappear after 24 hours, and insights may no longer be retrievable after expiry.
                {' '}Check Meta Business Suite or the Instagram app for any additional insights.
            </p>
        </section>
    );
}
