'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { PLATFORMS, type Action, type Monitor, type Source } from './listening-types';

const terms = (value: FormDataEntryValue | null) => String(value || '').split(',').map(term => term.trim()).filter(Boolean);
const timestamp = (value: string | null) => value ? new Date(value).toLocaleString() : 'Never';

export function MonitorPanel({ monitors, canManage, busy, act }: { monitors: Monitor[]; canManage: boolean; busy: boolean; act: Action }) {
    const [editing, setEditing] = useState<Monitor | 'new' | null>(null);
    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const body = { name: String(data.get('name')).trim(), keywords: terms(data.get('keywords')), excludedTerms: terms(data.get('excludedTerms')), platforms: data.getAll('platforms') };
        if (await act(`/api/listening/monitors${editing && editing !== 'new' ? `/${editing.id}` : ''}`, editing === 'new' ? 'POST' : 'PATCH', body)) setEditing(null);
    }
    const monitor = editing && editing !== 'new' ? editing : null;
    return <section className="space-y-4" aria-label="Monitor management">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Keyword monitors</h2>{canManage && <Button disabled={busy} onClick={() => setEditing('new')}>Create monitor</Button>}</div>
        <p className="text-sm text-[var(--text-muted)]">Monitors match keywords against available connected-account engagement and crawled pages. Pausing stops future collection.</p>
        {editing && canManage && <form key={monitor?.id || 'new'} onSubmit={save} className="card space-y-4 p-4">
            <h3 className="font-semibold">{monitor ? 'Edit monitor' : 'New monitor'}</h3>
            <label className="block text-sm">Name<input name="name" required maxLength={200} defaultValue={monitor?.name} className="input mt-1 w-full" /></label>
            <label className="block text-sm">Keywords (comma-separated)<input name="keywords" required defaultValue={monitor?.keywords.join(', ')} className="input mt-1 w-full" /></label>
            <label className="block text-sm">Excluded terms (comma-separated)<input name="excludedTerms" defaultValue={monitor?.excludedTerms.join(', ')} className="input mt-1 w-full" /></label>
            <fieldset><legend className="mb-2 text-sm">Platforms — leave empty for all</legend><div className="flex flex-wrap gap-3">{PLATFORMS.map(platform => <label key={platform} className="flex items-center gap-1 text-xs"><input type="checkbox" name="platforms" value={platform} defaultChecked={monitor?.platforms.includes(platform)} />{platform.toLowerCase().replaceAll('_', ' ')}</label>)}</div></fieldset>
            <div className="flex gap-2"><Button type="submit" disabled={busy}>Save monitor</Button><Button variant="ghost" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button></div>
        </form>}
        {!monitors.length && <p className="card p-6">No monitors yet. Create one to start matching conversations.</p>}
        {monitors.map(item => <article key={item.id} className="card space-y-2 p-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{item.name}</h3><span className="text-sm">{item.isActive ? 'Active' : 'Paused'} · {item._count.items} total results</span></div><p className="break-words text-sm">Keywords: {item.keywords.join(', ')}</p><p className="text-sm text-[var(--text-muted)]">Excludes: {item.excludedTerms.join(', ') || 'None'} · Platforms: {item.platforms.join(', ') || 'All'}</p><p className="text-xs text-[var(--text-muted)]">Last synced: {timestamp(item.lastSyncedAt)}</p>{canManage && <div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" disabled={busy} onClick={() => setEditing(item)}>Edit {item.name}</Button><Button variant="secondary" size="sm" disabled={busy} onClick={() => void act(`/api/listening/monitors/${item.id}`, 'PATCH', { isActive: !item.isActive })}>{item.isActive ? 'Pause' : 'Resume'}</Button><Button variant="danger" size="sm" disabled={busy} onClick={() => { if (window.confirm(`Delete monitor “${item.name}” and all its results?`)) void act(`/api/listening/monitors/${item.id}`, 'DELETE'); }}>Delete</Button></div>}</article>)}
    </section>;
}

export function SourcePanel({ sources, canManage, busy, act }: { sources: Source[]; canManage: boolean; busy: boolean; act: Action }) {
    const [editing, setEditing] = useState<Source | 'new' | null>(null);
    const source = editing && editing !== 'new' ? editing : null;
    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        if (await act(`/api/listening/sources${source ? `/${source.id}` : ''}`, source ? 'PATCH' : 'POST', { name: String(data.get('name')).trim(), url: String(data.get('url')).trim(), type: data.get('type') })) setEditing(null);
    }
    return <section className="space-y-4" aria-label="Source management">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Web crawler sources</h2>{canManage && <Button disabled={busy} onClick={() => setEditing('new')}>Create source</Button>}</div>
        <p className="text-sm text-[var(--text-muted)]">Limited coverage of configured public pages, RSS feeds and sitemaps. This is not a web-wide search or access to private social conversations.</p>
        {editing && canManage && <form key={source?.id || 'new'} onSubmit={save} className="card space-y-4 p-4"><h3 className="font-semibold">{source ? 'Edit source' : 'New source'}</h3><label className="block text-sm">Name<input className="input mt-1 w-full" name="name" required maxLength={200} defaultValue={source?.name} /></label><label className="block text-sm">Public URL<input className="input mt-1 w-full" name="url" required maxLength={2048} placeholder="https://example.com/feed" defaultValue={source?.url} /></label><label className="block text-sm">Source type<select className="input mt-1 w-full" name="type" defaultValue={source?.sourceType || 'auto'}>{['auto', 'rss', 'sitemap', 'page'].map(type => <option key={type}>{type}</option>)}</select></label><div className="flex gap-2"><Button type="submit" disabled={busy}>Save source</Button><Button variant="ghost" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button></div></form>}
        {!sources.length && <p className="card p-6">No crawler sources configured.</p>}
        {sources.map(item => <article key={item.id} className="card space-y-2 p-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{item.name}</h3><span className="text-sm">{!item.isActive ? 'Disabled' : item.lastError ? 'Needs attention' : item.lastCrawledAt ? 'Healthy' : 'Awaiting first crawl'} · {item.sourceType}</span></div><p className="break-all text-sm">{item.url}</p><p className="text-xs text-[var(--text-muted)]">Last crawled: {timestamp(item.lastCrawledAt)}</p>{item.lastError && <p className="break-words text-sm text-[var(--error)]">Last crawl error: {item.lastError}</p>}{canManage && <div className="flex gap-2"><Button variant="secondary" size="sm" disabled={busy} onClick={() => setEditing(item)}>Edit {item.name}</Button><Button variant="secondary" size="sm" disabled={busy} onClick={() => void act(`/api/listening/sources/${item.id}`, 'PATCH', { isActive: !item.isActive })}>{item.isActive ? 'Disable' : 'Enable'}</Button></div>}</article>)}
    </section>;
}
