'use client';

import { Button } from '@/components/ui/button';
import { PLATFORMS, SENTIMENTS, SOURCE_TYPES, type Monitor } from './listening-types';

export const EMPTY_FILTERS = { q: '', monitorId: '', platform: '', sentiment: '', sourceType: '', from: '', to: '', unread: '' };
export type Filters = typeof EMPTY_FILTERS;

export function listeningQuery(filters: Filters, page: number, pageSize: number) {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    Object.entries(filters).forEach(([key, value]) => {
        if (value) query.set(key, key === 'from' || key === 'to' ? new Date(value).toISOString() : value);
    });
    return query.toString();
}

export function ListeningFilters({ filters, onChange, monitors }: { filters: Filters; onChange: (filters: Filters) => void; monitors: Monitor[] }) {
    const set = (key: keyof Filters, value: string) => onChange({ ...filters, [key]: value });
    return <section aria-label="Filter mentions" className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">Search text or author<input className="input mt-1 w-full" value={filters.q} maxLength={500} onChange={event => set('q', event.target.value)} placeholder="Search mentions…" /></label>
        <label className="text-sm">Monitor<select className="input mt-1 w-full" value={filters.monitorId} onChange={event => set('monitorId', event.target.value)}><option value="">All monitors</option>{monitors.map(monitor => <option key={monitor.id} value={monitor.id}>{monitor.name}</option>)}</select></label>
        {([['platform', 'Platform', PLATFORMS], ['sentiment', 'Sentiment', SENTIMENTS], ['sourceType', 'Source', SOURCE_TYPES]] as const).map(([key, label, values]) => <label key={key} className="text-sm">{label}<select className="input mt-1 w-full" value={filters[key]} onChange={event => set(key, event.target.value)}><option value="">All {label.toLowerCase()}s</option>{values.map(value => <option key={value} value={value}>{value.toLowerCase().replaceAll('_', ' ')}</option>)}</select></label>)}
        <label className="text-sm">From (local time)<input type="datetime-local" className="input mt-1 w-full" value={filters.from} onChange={event => set('from', event.target.value)} /></label>
        <label className="text-sm">To (local time)<input type="datetime-local" className="input mt-1 w-full" value={filters.to} onChange={event => set('to', event.target.value)} /></label>
        <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filters.unread === 'true'} onChange={event => set('unread', event.target.checked ? 'true' : '')} />Unread only</label><Button variant="ghost" size="sm" onClick={() => onChange({ ...EMPTY_FILTERS })}>Clear filters</Button></div>
    </section>;
}
