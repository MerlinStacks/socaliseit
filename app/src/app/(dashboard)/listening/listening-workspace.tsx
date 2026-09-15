'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/usePermissions';
import { useOrganization } from '@/hooks/use-organization';
import { EMPTY_FILTERS, ListeningFilters, listeningQuery, type Filters } from './listening-filters';
import { MentionCard } from './listening-item';
import { MonitorPanel, SourcePanel } from './listening-management';
import { listeningRequest, SENTIMENTS, type ListeningData } from './listening-types';

type ActionResult = { success?: boolean; partial?: boolean; updatedCount?: number; errors?: { stage: string; message: string }[] };

export default function ListeningWorkspace() {
    const { organization, isLoading } = useOrganization();
    if (isLoading) return <p role="status" className="p-8">Loading workspace…</p>;
    if (!organization) return <p role="alert" className="p-8">Select a workspace to load social listening.</p>;
    // Remount local selections and forms when switching workspaces.
    return <Workspace key={organization?.id || 'loading'} organizationId={organization?.id} />;
}

function Workspace({ organizationId }: { organizationId?: string }) {
    const permissions = usePermissions();
    const canManage = !permissions.isLoading && permissions.hasPermission('discovery.manage');
    const queryClient = useQueryClient();
    const [tab, setTab] = useState('Mentions');
    const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [selected, setSelected] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<{ error: boolean; text: string; retry?: () => void } | null>(null);
    const inboxTab = tab === 'Mentions' || tab === 'Overview';
    const activeFilters = inboxTab ? filters : EMPTY_FILTERS;
    const invalidDates = inboxTab && !!(filters.from && filters.to && new Date(filters.from) > new Date(filters.to));
    const query = useQuery<ListeningData>({
        queryKey: ['listening-data', organizationId, activeFilters, inboxTab ? page : 1, pageSize],
        queryFn: ({ signal }) => listeningRequest(`/api/listening?${listeningQuery(activeFilters, inboxTab ? page : 1, pageSize)}`, { signal }),
        enabled: !!organizationId && !invalidDates,
        retry: false,
    });
    const data = query.data;
    const pageIds = data?.items.map(item => item.id) || [];
    const selection = selected.filter(id => pageIds.includes(id));

    async function act(url: string, method: string, body?: unknown): Promise<boolean> {
        if (busy || !canManage) return false;
        setBusy(true); setNotice(null);
        const retry = () => { void act(url, method, body); };
        try {
            const result = await listeningRequest<ActionResult>(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body !== undefined && { body: JSON.stringify(body) }) });
            const requested = body && typeof body === 'object' && 'ids' in body && Array.isArray(body.ids) ? body.ids.length : undefined;
            const partialUpdate = requested !== undefined && result.updatedCount !== requested;
            const failed = result.success === false || result.partial || !!result.errors?.length || partialUpdate;
            setNotice({ error: !!failed, text: failed ? (partialUpdate ? `Only ${result.updatedCount ?? 0} of ${requested} mentions were updated. Some may no longer be available.` : `Sync incomplete. ${result.errors?.map(error => `${error.stage}: ${error.message}`).join('; ') || 'Some stages failed.'}`) : url.endsWith('/sync') ? 'Listening sync completed.' : 'Changes saved.', ...(failed && { retry }) });
            setSelected([]);
            await queryClient.invalidateQueries({ queryKey: ['listening-data', organizationId] });
            return !failed;
        } catch (error) {
            setNotice({ error: true, text: error instanceof Error ? error.message : 'Action failed. Please retry.', retry });
            return false;
        } finally { setBusy(false); }
    }
    function changeFilters(next: Filters) { setFilters(next); setPage(1); setSelected([]); }
    function changePage(next: number) { setPage(next); setSelected([]); }
    const mark = (ids: string[], isRead: boolean) => void act('/api/listening/items', 'PATCH', { ids, isRead });

    return <div className="h-full overflow-auto bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--bg-secondary)] p-4 sm:px-8 sm:py-5"><div><h1 className="text-xl font-semibold">Social Listening</h1><p className="text-sm text-[var(--text-muted)]">Find the conversations that need your attention.</p></div>{canManage && <Button variant="secondary" isLoading={busy} onClick={() => void act('/api/listening/sync', 'POST')}>Sync listening</Button>}</header>
        <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-8">
            {notice && <div role={notice.error ? 'alert' : 'status'} className="card flex flex-wrap items-center justify-between gap-3 p-4"><p className={notice.error ? 'text-[var(--error)]' : ''}>{notice.text}</p>{notice.retry && canManage && <Button variant="secondary" disabled={busy} onClick={notice.retry}>Retry action</Button>}</div>}
            <nav aria-label="Listening sections" className="flex flex-wrap gap-2">{['Mentions', 'Overview', 'Monitors', 'Sources'].map(name => <Button key={name} variant={tab === name ? 'primary' : 'ghost'} aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</Button>)}</nav>
            {!permissions.isLoading && !canManage && <p className="text-sm text-[var(--text-muted)]">Read-only access. Managing listening and read status requires discovery management permission.</p>}
            {(tab === 'Mentions' || tab === 'Overview') && <ListeningFilters filters={filters} onChange={changeFilters} monitors={data?.monitors || []} />}
            {invalidDates && <p role="alert" className="text-[var(--error)]">From must be before or equal to To.</p>}
            {query.isError && <div role="alert" className="card space-y-3 p-4"><p>Could not load listening: {query.error.message}</p><Button variant="secondary" onClick={() => void query.refetch()}>Retry loading</Button></div>}
            {query.isFetching && <p role="status" className="text-sm text-[var(--text-muted)]">Loading listening…</p>}
            {data && !invalidDates && <>
                <section aria-label="Listening coverage" className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-muted)]"><p><strong>Connected accounts:</strong> {data.platforms.length ? data.platforms.map(platform => platform.toLowerCase().replaceAll('_', ' ')).join(', ') : 'None connected'}. Coverage depends on platform permissions and available engagement.</p><p className="mt-1"><strong>Limited web crawler:</strong> {data.crawlerSources.filter(source => source.isActive).length} active sources. Configured public pages and feeds only; no web-wide or private conversation coverage.</p></section>
                {tab === 'Overview' && <section className="space-y-4"><h2 className="text-lg font-semibold">Overview</h2><p className="text-sm text-[var(--text-muted)]">Mention and sentiment totals cover the entire filtered dataset, not just this page. Monitor counts are workspace-wide.</p><div className="grid gap-3 sm:grid-cols-3">{[['Matching mentions', data.totalCount], ['Unread matching mentions', data.unreadCount], ['Active monitors', data.monitors.filter(monitor => monitor.isActive).length]].map(([label, value]) => <div key={label} className="card p-4"><p className="text-sm text-[var(--text-muted)]">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</div><h3 className="font-semibold">Sentiment</h3><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{SENTIMENTS.map(sentiment => <div key={sentiment} className="card p-4"><p className="capitalize">{sentiment}</p><p className="text-2xl font-semibold">{data.sentiment[sentiment] || 0}</p></div>)}</div></section>}
                {tab === 'Mentions' && <section aria-label="Mentions inbox" className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Mentions inbox <span className="text-sm font-normal text-[var(--text-muted)]">{data.totalCount} matching · {data.unreadCount} unread</span></h2><label className="text-sm">Per page <select className="input" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); changePage(1); }}>{[25, 50, 100].map(size => <option key={size}>{size}</option>)}</select></label></div>
                    {canManage && data.items.length > 0 && <div className="flex flex-wrap items-center gap-3 rounded-lg bg-[var(--bg-secondary)] p-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy || query.isFetching} checked={selection.length === pageIds.length} onChange={event => setSelected(event.target.checked ? pageIds : [])} />Select this page</label><span className="text-sm">{selection.length} selected</span><Button size="sm" variant="secondary" disabled={!selection.length || busy || query.isFetching} onClick={() => mark(selection, true)}>Mark selected read</Button><Button size="sm" variant="secondary" disabled={!selection.length || busy || query.isFetching} onClick={() => mark(selection, false)}>Mark selected unread</Button></div>}
                    {!data.items.length && <div className="card space-y-2 p-8 text-center"><h3 className="font-semibold">{data.monitors.length ? 'No matching mentions' : 'Start with a keyword monitor'}</h3><p className="text-sm text-[var(--text-muted)]">{data.monitors.length ? 'Adjust filters or sync listening to collect available matches.' : 'Create a monitor in the Monitors tab, then sync your available sources.'}</p>{canManage && !data.monitors.length && <Button onClick={() => setTab('Monitors')}>Set up monitors</Button>}</div>}
                    {data.items.map(item => <MentionCard key={item.id} item={item} canManage={canManage} busy={busy || query.isFetching} selected={selection.includes(item.id)} onSelect={() => setSelected(selection.includes(item.id) ? selection.filter(id => id !== item.id) : [...selection, item.id])} onRead={() => mark([item.id], !item.isRead)} />)}
                    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[var(--text-muted)]">Page {data.page} of {Math.max(1, data.totalPages)} · {data.totalCount} results</p><div className="flex gap-2"><Button variant="secondary" disabled={page <= 1 || query.isFetching || busy} onClick={() => changePage(Math.min(page - 1, Math.max(1, data.totalPages)))}>Previous</Button><Button variant="secondary" disabled={page >= data.totalPages || query.isFetching || busy} onClick={() => changePage(page + 1)}>Next</Button></div></div>
                </section>}
                {tab === 'Monitors' && <MonitorPanel monitors={data.monitors} canManage={canManage} busy={busy} act={act} />}
                {tab === 'Sources' && <SourcePanel sources={data.crawlerSources} canManage={canManage} busy={busy} act={act} />}
            </>}
        </div>
    </div>;
}
