'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InboxOptions, inboxRequest, typeNames } from './inbox-model';
import { InboxReport, ReportingFilters, reportingParams, validReportingFilters, workloadPercent } from './inbox-reporting-model';
import styles from './inbox-reporting.module.css';

const metrics = [
    ['open', 'Open', 'Conversations needing attention'],
    ['unassignedOpen', 'Unassigned open', 'Open conversations without an owner'],
    ['snoozed', 'Snoozed', 'Conversations set aside'],
    ['resolved', 'Resolved', 'Currently resolved, not resolution events'],
    ['openOlderThan24h', 'Open · over 24 hours', 'Since latest conversation activity'],
    ['openOlderThan72h', 'Open · over 72 hours', 'Also included in the over-24-hour count'],
] as const;

export function InboxReporting({ options }: { options?: InboxOptions }) {
    const { data: session } = useSession();
    const [selection, setSelection] = useState<ReportingFilters>({ socialAccountId: '', platform: '' });
    const filters = validReportingFilters(selection, options?.accounts || []);
    const params = reportingParams(filters);
    const query = useQuery({
        queryKey: ['inbox-reporting', session?.user?.currentOrganizationId, session?.user?.id, params],
        enabled: !!session?.user?.currentOrganizationId,
        queryFn: ({ signal }) => inboxRequest<InboxReport>(`/api/inbox/reporting?${params}`, { signal }),
        staleTime: 60_000,
    });
    const report = query.data?.data;
    const platforms = [...new Set(options?.accounts.map(account => account.platform))].sort();
    return <section className={styles.root} aria-labelledby="inbox-insights-title" aria-busy={query.isFetching}>
        <header className={styles.header}>
            <div><p className={styles.eyebrow}><BarChart3 size={14} />Inbox health</p><h2 id="inbox-insights-title">Insights</h2><p>A snapshot of your team’s current workload.</p></div>
            <Button variant="secondary" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw size={14} />{query.isFetching ? 'Refreshing…' : 'Refresh insights'}</Button>
        </header>
        <div className={styles.filters}>
            <label>Platform<select value={filters.platform} disabled={!options} onChange={event => setSelection(validReportingFilters({ ...filters, platform: event.target.value }, options?.accounts || []))}><option value="">All platforms</option>{platforms.map(platform => <option key={platform} value={platform}>{platform.replaceAll('_', ' ')}</option>)}</select></label>
            <label>Account<select value={filters.socialAccountId} disabled={!options} onChange={event => setSelection({ ...filters, socialAccountId: event.target.value })}><option value="">All accounts</option>{options?.accounts.filter(account => !filters.platform || account.platform === filters.platform).map(account => <option key={account.id} value={account.id}>{account.name} · {account.platform.replaceAll('_', ' ')}</option>)}</select></label>
        </div>
        <p className={styles.freshness} role="status">{report ? <>Snapshot generated <time dateTime={report.generatedAt}>{new Date(report.generatedAt).toLocaleString()}</time>. {query.isError ? 'Refresh failed; showing the last successful snapshot.' : 'Refresh for the latest counts.'}</> : query.isLoading ? 'Loading inbox insights…' : 'No snapshot loaded.'}</p>
        {query.isError && <div role="alert" className={styles.notice}>Couldn’t load insights: {query.error.message} <button onClick={() => query.refetch()} disabled={query.isFetching}>Retry insights</button></div>}
        {report && query.data && <>
            {report.summary.open + report.summary.resolved + report.summary.snoozed === 0 && <div role="status" className={styles.notice}><strong>No conversations in this view.</strong><p>Try another account or platform, or sync your inbox to bring in conversations.</p></div>}
            <dl className={styles.metrics}>{metrics.map(([key, label, hint]) => <div key={key} className={styles.metric}><dt>{label}</dt><dd>{report.summary[key].toLocaleString()}</dd><p>{hint}</p></div>)}</dl>
            <div className={styles.breakdowns}>
                <section className={styles.card}><h3>Workload by type</h3><p>Current status across conversation types</p><div className={styles.tableWrap}><table><caption className="sr-only">Conversation counts by type and status</caption><thead><tr><th scope="col">Type</th><th scope="col">Open</th><th scope="col">Resolved</th><th scope="col">Snoozed</th></tr></thead><tbody>{report.byType.map(row => <tr key={row.type}><th scope="row">{typeNames[row.type] || row.type}</th><td>{row.open.toLocaleString()}</td><td>{row.resolved.toLocaleString()}</td><td>{row.snoozed.toLocaleString()}</td></tr>)}</tbody></table></div>{!report.byType.length && <p>No workload by type yet.</p>}</section>
                <section className={styles.card}><h3>Open workload by teammate</h3><p>Ownership and aging of open conversations</p><div className={styles.tableWrap}><table><caption className="sr-only">Open conversations by teammate</caption><thead><tr><th scope="col">Teammate</th><th scope="col">Open</th><th scope="col">Over 24h</th></tr></thead><tbody>{report.byAssignee.map(row => <tr key={row.userId ?? '__unassigned'}><th scope="row">{row.userId === null ? 'Unassigned' : row.name}</th><td>{row.open.toLocaleString()}</td><td>{row.olderThan24h.toLocaleString()}</td></tr>)}</tbody></table></div>{!report.byAssignee.length && <p>No open teammate workload.</p>}</section>
                <section className={styles.card}><h3>Age of open conversations</h3><p>Time since latest conversation activity</p><ul className={styles.buckets}>{report.ageBuckets.map(bucket => <li key={bucket.key}><div><span>{bucket.label}</span><strong>{bucket.count.toLocaleString()} <small>({Math.round(workloadPercent(bucket.count, report.summary.open))}%)</small></strong></div><div className={styles.track} aria-hidden="true"><span style={{ width: `${workloadPercent(bucket.count, report.summary.open)}%` }} /></div></li>)}</ul>{!report.summary.open && <p>No open conversations to age.</p>}</section>
                <section className={styles.card}><h3>What these metrics mean</h3><p><strong>Age measures latest activity, not response or waiting time.</strong> Outbound messages and replies can update that activity.</p><dl className={styles.definitions}><dt>Aging</dt><dd>{query.data.definitions.aging}</dd><dt>Resolutions</dt><dd>{query.data.definitions.resolutions}</dd></dl></section>
            </div>
        </>}
    </section>;
}
