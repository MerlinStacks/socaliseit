'use client';

import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { Activity, ArrowDown, Download, RefreshCw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ActivityTimeline, ActivitySkeleton } from '@/components/activity/activity-timeline';
import { activityLabel, exportActivityCsv, type ActivityResponse } from '@/components/activity/activity-utils';

/** A history of recorded events, not an exhaustive audit of every workspace action. */
export default function ActivityPage() {
    const { data: session, status } = useSession();
    const organizationId = session?.user?.currentOrganizationId;
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
        return () => clearTimeout(timer);
    }, [search]);

    const query = useInfiniteQuery({
        queryKey: ['activity', organizationId, filter, debouncedSearch],
        enabled: !!organizationId,
        initialPageParam: 0,
        queryFn: async ({ pageParam, signal }): Promise<ActivityResponse> => {
            const params = new URLSearchParams({ limit: '30', offset: String(pageParam), type: filter, search: debouncedSearch });
            const response = await fetch(`/api/activity?${params}`, { signal });
            if (!response.ok) throw new Error('Could not load workspace activity. Please try again.');
            return response.json();
        },
        getNextPageParam: (page) => page.hasMore ? page.offset + page.activities.length : undefined,
    });

    const firstPage = query.data?.pages[0];
    const activities = query.data?.pages.flatMap(page => page.activities) ?? [];
    const categories = firstPage?.categories ?? [];
    const filters = [{ type: 'all', count: firstPage?.workspaceTotal ?? 0 }, ...categories];
    if (filter !== 'all' && !categories.some(category => category.type === filter)) filters.push({ type: filter, count: 0 });
    const pendingSearch = search.trim() !== debouncedSearch;
    const loading = status === 'loading' || (!!organizationId && query.isPending);
    const resetFilters = () => { setFilter('all'); setSearch(''); setDebouncedSearch(''); };

    return (
        <div className="min-h-full bg-[var(--bg-primary)] pb-28 md:pb-10">
            <header className="border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-6 md:px-8">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient text-white"><Activity className="h-5 w-5" /></div>
                        <div>
                            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Activity log</h1>
                            <p className="mt-1 text-sm text-[var(--text-muted)]">A shared history of your workspace’s recorded changes.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" onClick={() => query.refetch()} disabled={query.isFetching || !organizationId} aria-label="Refresh activity">
                            <RefreshCw className={cn('h-4 w-4', query.isFetching && 'animate-spin')} /><span className="hidden sm:inline">Refresh</span>
                        </Button>
                        <Button variant="secondary" onClick={() => exportActivityCsv(activities)} disabled={!activities.length || pendingSearch}>
                            <Download className="h-4 w-4" />Export loaded
                        </Button>
                    </div>
                </div>
            </header>
            <main className="mx-auto max-w-6xl px-4 pt-6 md:px-8 md:pt-8">
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="font-semibold">Workspace history</h2>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">Browse by category or search across recorded events.</p>
                    </div>
                    <div className="relative w-full sm:max-w-sm">
                        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[var(--text-muted)]" />
                        <input aria-label="Search activity" type="search" maxLength={200} placeholder="Search people, actions, or content…" value={search} onChange={event => setSearch(event.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] py-2.5 pl-10 pr-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-gold)]" />
                    </div>
                </div>
                <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
                    <aside className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                        <h3 className="px-3 pb-3 pt-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Categories</h3>
                        <div role="group" aria-label="Activity categories" className="flex gap-1 overflow-x-auto lg:flex-col">
                            {filters.map(category => (
                                <button key={category.type} type="button" aria-pressed={filter === category.type} onClick={() => setFilter(category.type)} className={cn('flex shrink-0 items-center justify-between gap-4 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent-gold)]', filter === category.type ? 'bg-[var(--bg-tertiary)] font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]')}>
                                    {activityLabel(category.type)}{' '}<span className="rounded-md bg-[var(--bg-primary)] px-2 py-0.5 text-xs tabular-nums text-[var(--text-muted)]">{firstPage ? category.count.toLocaleString() : '—'}</span>
                                </button>
                            ))}
                        </div>
                        <p className="px-3 pb-1 pt-4 text-xs leading-relaxed text-[var(--text-muted)]">Categories appear when they have recorded events. Older actions may not have been logged.</p>
                    </aside>
                    <section aria-label="Activity history" aria-busy={loading || pendingSearch} className="min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)]">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-5 py-4">
                            <div className="flex items-center gap-2"><h3 className="font-semibold">{activityLabel(filter)}</h3><span className="text-xs text-[var(--text-muted)]">Newest first</span></div>
                            {(filter !== 'all' || search) && <button onClick={resetFilters} className="flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:underline"><X className="h-3 w-3" />Clear filters</button>}
                        </div>
                        {!organizationId && status !== 'loading' ? (
                            <p role="alert" className="p-8 text-sm text-[var(--text-muted)]">Select a workspace to view its activity.</p>
                        ) : loading ? <ActivitySkeleton /> : query.isError && !activities.length ? (
                            <div role="alert" className="px-6 py-14 text-center">
                                <h4 className="font-semibold">Activity couldn’t be loaded</h4>
                                <p className="mb-5 mt-2 text-sm text-[var(--text-muted)]">Try loading your workspace history again.</p>
                                <Button variant="secondary" onClick={() => query.refetch()}>Try again</Button>
                            </div>
                        ) : !activities.length ? (
                            <div className="px-6 py-16 text-center">
                                <Activity className="mx-auto mb-4 h-8 w-8 text-[var(--text-muted)]" />
                                <h4 className="font-semibold">{search || filter !== 'all' ? 'No matching activity' : 'Your workspace history starts here'}</h4>
                                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[var(--text-muted)]">{search || filter !== 'all' ? 'Try a different search or clear your filters to see more events.' : 'Recorded changes, such as creating posts and inviting teammates, will appear here. Earlier actions may not have been logged.'}</p>
                                {(search || filter !== 'all') && <Button variant="secondary" className="mt-5" onClick={resetFilters}>Clear filters</Button>}
                            </div>
                        ) : (
                            <>
                                <ActivityTimeline activities={activities} />
                                <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-4">
                                    <p role="status" className="text-xs text-[var(--text-muted)]">Showing {activities.length.toLocaleString()} of {firstPage?.total.toLocaleString()} events{pendingSearch ? ' · Searching…' : ''}</p>
                                    {query.hasNextPage && <Button variant="secondary" onClick={() => query.fetchNextPage()} disabled={query.isFetching || pendingSearch}><ArrowDown className="h-4 w-4" />{query.isFetchingNextPage ? 'Loading…' : 'Load more'}</Button>}
                                </footer>
                                {query.isError && <div role="alert" className="flex flex-wrap items-center gap-3 px-5 pb-5 text-sm text-[var(--error)]">Couldn’t {query.isFetchNextPageError ? 'load more' : 'refresh'} events.<Button variant="secondary" onClick={() => query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()}>Retry</Button></div>}
                            </>
                        )}
                    </section>
                </div>
            </main>
        </div>
    );
}
