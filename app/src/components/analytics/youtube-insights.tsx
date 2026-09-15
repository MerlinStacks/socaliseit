'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Play } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { YouTubeAnalytics, YouTubeAnalyticsAvailability } from '@/lib/platform-api/youtube-analytics';

interface YouTubeResponse {
    analytics: YouTubeAnalytics | null;
    accounts: { id: string; name: string }[];
    accountId: string | null;
    videos: { id: string; title: string }[];
}

const number = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });
const percent = (value: number) => `${number(value)}%`;
const selectClass = 'mt-1 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-2 text-sm text-[var(--text-primary)]';

function Availability({ status }: { status: YouTubeAnalyticsAvailability }) {
    return <p className="py-4 text-sm text-[var(--text-muted)]" role="status">
        {status === 'reconnect_required' ? <>Reconnect this YouTube account in <Link className="underline text-[var(--accent-gold)]" href="/settings?tab=accounts">account settings</Link> to grant analytics access.</>
            : status === 'not_requested' ? 'Select a video to view audience retention.'
                : status === 'empty' ? 'No report rows for this selection. Recent activity may still be processing.'
                    : 'This report is currently unavailable. Try refreshing later.'}
    </p>;
}

/** Shared by the SSR and SPA analytics dashboard, on desktop and mobile. */
export function YouTubeInsights({ range }: { range: string }) {
    const id = useId();
    const reportRange = ['7d', '30d', '90d'].includes(range) ? range : '90d';
    const [accountId, setAccountId] = useState('');
    const [videoId, setVideoId] = useState('');
    const [retry, setRetry] = useState(0);
    const [result, setResult] = useState<{ key: string; data?: YouTubeResponse; error?: string; availability?: YouTubeAnalyticsAvailability }>();
    const [options, setOptions] = useState<YouTubeResponse>();
    const key = JSON.stringify([reportRange, accountId, videoId, retry]);

    useEffect(() => {
        const controller = new AbortController();
        const params = new URLSearchParams({ range: reportRange });
        if (accountId) params.set('accountId', accountId);
        if (videoId) params.set('videoId', videoId);
        async function load() {
            try {
                const response = await fetch(`/api/analytics/youtube?${params}`, { signal: controller.signal, cache: 'no-store' });
                const body = await response.json();
                if (controller.signal.aborted) return;
                if (!response.ok) {
                    setResult({ key, error: body.error || 'Unable to load YouTube analytics.', availability: body.availability });
                    return;
                }
                setOptions(body);
                setResult({ key, data: body });
            } catch {
                if (!controller.signal.aborted) setResult({ key, error: 'Unable to load YouTube analytics. Please try again.' });
            }
        }
        void load();
        return () => controller.abort();
    }, [accountId, videoId, reportRange, retry, key]);

    const loading = result?.key !== key;
    const current = loading ? undefined : result;
    const analytics = current?.data?.analytics;
    const summary = analytics?.availability.summary === 'available' ? analytics.summary : null;
    const videos = !accountId || options?.accountId === accountId ? options?.videos ?? [] : [];

    return <section className="card min-w-0 space-y-5 p-4 sm:p-6" aria-labelledby={`${id}-title`} aria-busy={loading}>
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h2 id={`${id}-title`} className="flex items-center gap-2 text-lg font-semibold"><Play className="h-5 w-5 text-red-500" />YouTube insights</h2>
                <p className="text-sm text-[var(--text-muted)]">Activity-date reports · {videoId ? 'Selected video' : 'Entire channel'}</p>
            </div>
            <button type="button" className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-50" disabled={loading} onClick={() => setRetry(value => value + 1)}>Refresh reports</button>
        </div>
        {range !== reportRange && <p className="text-sm text-[var(--text-secondary)]">YouTube reports support up to 90 days here. Showing the last 90 days instead of {range === 'year' ? '“This year”' : 'the selected dashboard range'}.</p>}
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <label className="min-w-0 text-sm" htmlFor={`${id}-account`}>YouTube account
                <select id={`${id}-account`} className={selectClass} value={accountId || options?.accountId || ''} disabled={!options?.accounts.length} onChange={event => { setAccountId(event.target.value); setVideoId(''); }}>
                    {!options?.accounts.length && <option value="">No account available</option>}
                    {options?.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
            </label>
            <label className="min-w-0 text-sm" htmlFor={`${id}-video`}>Video · filters all reports
                <select id={`${id}-video`} className={selectClass} value={videoId} disabled={!videos.length} onChange={event => { setAccountId(accountId || options?.accountId || ''); setVideoId(event.target.value); }}>
                    <option value="">Entire channel · select a video for retention</option>
                    {videos.map(video => <option key={video.id} value={video.id}>{video.title}</option>)}
                </select>
            </label>
        </div>
        <p className="text-xs text-[var(--text-muted)]">Video choices come from up to 50 recent published posts. Channel reports include activity across the channel.</p>
        {loading && <p role="status" className="py-8 text-sm text-[var(--text-muted)]">Loading YouTube reports…</p>}
        {current?.error && <div role="alert"><p className="text-sm text-[var(--text-secondary)]">{current.error}</p>{current.availability && <Availability status={current.availability} />}</div>}
        {current?.data && !analytics && <p className="text-sm text-[var(--text-muted)]">Connect a YouTube account in <Link href="/settings?tab=accounts" className="underline">account settings</Link> to see insights.</p>}
        {analytics && <>
            <div className="text-xs text-[var(--text-muted)] space-y-1">
                <p>{analytics.startDate} – {analytics.endDate}, inclusive · America/Los_Angeles · ends yesterday.</p>
                <p>Latest daily row: {analytics.dataThrough ?? 'not available'}. YouTube reports can lag; the latest row does not guarantee the full period is processed.</p>
                <p>These metrics measure activity during this period, unlike lifetime public video counters elsewhere on the dashboard.</p>
            </div>
            {summary ? <>
                <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {[
                        ['Views', number(summary.views)], ['Watch time', `${number(summary.watchMinutes)} min`],
                        ['Average view duration', `${number(summary.averageViewDuration)} sec`], ['Average viewed', percent(summary.averageViewPercentage)],
                        ['Subscribers gained', number(summary.subscribersGained)], ['Subscribers lost', number(summary.subscribersLost)],
                        ['Net subscribers', number(summary.netSubscribers)], ['Gained / views', summary.subscriberConversionRate === null ? 'Not available (no views)' : percent(summary.subscriberConversionRate)],
                    ].map(([label, value]) => <div key={label} className="rounded-lg bg-[var(--bg-tertiary)] p-3"><dt className="text-xs text-[var(--text-muted)]">{label}</dt><dd className="mt-1 text-lg font-semibold">{value}</dd></div>)}
                </dl>
                <p className="text-xs text-[var(--text-muted)]">Subscriber conversion = subscribers gained ÷ views × 100. This is not a unique-viewer funnel.</p>
            </> : <div><h3 className="font-medium">Period summary</h3><Availability status={analytics.availability.summary} /></div>}
            <div className="grid min-w-0 gap-6 lg:grid-cols-2">
                <div className="min-w-0"><h3 className="mb-3 font-medium">Watch time trend · minutes</h3>
                    {analytics.availability.daily === 'available' ? <ReportChart data={analytics.daily.map(row => ({ date: row.date, watchMinutes: row.watchMinutes }))} xKey="date" yKey="watchMinutes" name="Watch time (min)" /> : <Availability status={analytics.availability.daily} />}
                </div>
                <div className="min-w-0"><h3 className="mb-3 font-medium">Audience retention</h3>
                    {analytics.availability.retention === 'available' ? <ReportChart data={analytics.retention.map(row => ({ elapsed: row.elapsedVideoTimeRatio * 100, audience: row.audienceWatchRatio * 100 }))} xKey="elapsed" yKey="audience" name="Audience watching (%)" retention /> : <Availability status={analytics.availability.retention} />}
                    <p className="text-xs text-[var(--text-muted)]">Elapsed video time (%) vs audience watching (%). Rewatches can push audience retention above 100%.</p>
                </div>
            </div>
            <div><h3 className="mb-3 font-medium">Traffic sources</h3>
                {analytics.availability.trafficSources === 'available' ? <div className="overflow-x-auto"><table className="w-full text-left text-sm">
                    <thead className="text-xs text-[var(--text-muted)]"><tr><th scope="col" className="p-2">Source</th><th scope="col" className="p-2 text-right">Views</th><th scope="col" className="p-2 text-right">Watch minutes</th></tr></thead>
                    <tbody>{analytics.trafficSources.map(row => <tr key={row.source} className="border-t border-[var(--border)]"><th scope="row" className="p-2 font-normal">{row.source.replaceAll('_', ' ').toLowerCase()}</th><td className="p-2 text-right tabular-nums">{number(row.views)}</td><td className="p-2 text-right tabular-nums">{number(row.watchMinutes)}</td></tr>)}</tbody>
                </table></div> : <Availability status={analytics.availability.trafficSources} />}
            </div>
        </>}
    </section>;
}

function ReportChart({ data, xKey, yKey, name, retention = false }: {
    data: Record<string, string | number>[]; xKey: string; yKey: string; name: string; retention?: boolean;
}) {
    return <div className="h-60 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={1}>
            <LineChart data={data} margin={{ top: 10, right: 15, left: 0, bottom: 10 }} accessibilityLayer>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey={xKey} type={retention ? 'number' : 'category'} domain={retention ? [0, 100] : undefined} tickFormatter={retention ? percent : undefined} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} minTickGap={25} />
                <YAxis domain={[0, 'auto']} tickFormatter={retention ? percent : number} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} width={55} />
                <Tooltip contentStyle={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} labelFormatter={value => retention ? `Elapsed: ${percent(Number(value))}` : value} />
                <Line type="linear" dataKey={yKey} name={name} stroke="var(--accent-gold)" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
            </LineChart>
        </ResponsiveContainer>
    </div>;
}
