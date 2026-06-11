'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { clientLogger } from '@/lib/client-logger';

interface ListeningClientActionsProps {
    unreadCount: number;
}

export function ListeningClientActions({ unreadCount }: ListeningClientActionsProps) {
    const [isSyncing, setIsSyncing] = useState(false);
    const router = useRouter();

    const handleSync = useCallback(async () => {
        setIsSyncing(true);
        try {
            const response = await fetch('/api/listening/sync', { method: 'POST' });
            if (!response.ok) throw new Error('Sync failed');
            router.refresh();
        } catch (error) {
            clientLogger.error({ error }, 'Failed to sync social listening');
        } finally {
            setIsSyncing(false);
        }
    }, [router]);

    return (
        <div className="flex items-center gap-2">
            {unreadCount > 0 && (
                <span className="px-2 py-1 rounded-full bg-[var(--accent-gold-light)] text-[var(--accent-gold)] text-xs font-medium">
                    {unreadCount} new
                </span>
            )}
            <Button variant="secondary" size="sm" onClick={handleSync} disabled={isSyncing}>
                {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {isSyncing ? 'Listening...' : 'Sync Listening'}
            </Button>
        </div>
    );
}

export function CreateMonitorForm() {
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    async function handleSubmit(formData: FormData) {
        setIsSaving(true);
        setError(null);

        try {
            const response = await fetch('/api/listening/monitors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.get('name'),
                    keywords: String(formData.get('keywords') || '').split(','),
                    excludedTerms: String(formData.get('excludedTerms') || '').split(','),
                }),
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'Failed to create monitor');
            router.refresh();
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Failed to create monitor');
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <form action={handleSubmit} className="card p-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="font-semibold">Create listening monitor</h2>
                    <p className="text-sm text-[var(--text-muted)]">Track brand names, competitors, products, campaigns, or issue keywords.</p>
                </div>
                <Button type="submit" disabled={isSaving}>
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add Monitor
                </Button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
                <label className="text-sm">
                    <span className="mb-1 block text-[var(--text-muted)]">Name</span>
                    <input name="name" className="input w-full" placeholder="Brand reputation" />
                </label>
                <label className="text-sm md:col-span-2">
                    <span className="mb-1 block text-[var(--text-muted)]">Keywords</span>
                    <input name="keywords" required className="input w-full" placeholder="brand name, product, #campaign" />
                </label>
                <label className="text-sm md:col-span-3">
                    <span className="mb-1 block text-[var(--text-muted)]">Exclude terms</span>
                    <input name="excludedTerms" className="input w-full" placeholder="jobs, unrelated phrase" />
                </label>
            </div>
            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        </form>
    );
}

export function CreateCrawlerSourceForm() {
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    async function handleSubmit(formData: FormData) {
        setIsSaving(true);
        setError(null);

        try {
            const response = await fetch('/api/listening/sources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.get('name'),
                    url: formData.get('url'),
                    sourceType: formData.get('sourceType'),
                    crawlDepth: formData.get('crawlDepth') === '1' ? 1 : 0,
                }),
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'Failed to add source');
            router.refresh();
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Failed to add source');
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <form action={handleSubmit} className="card p-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="font-semibold">Crawler source</h2>
                    <p className="text-sm text-[var(--text-muted)]">Add RSS feeds, sitemaps, or public pages to crawl directly.</p>
                </div>
                <Button type="submit" disabled={isSaving}>
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add Source
                </Button>
            </div>

            <div className="mt-4 grid gap-3">
                <input name="name" className="input w-full" placeholder="Industry news" />
                <input name="url" required className="input w-full" placeholder="https://example.com/feed.xml" />
                <div className="grid gap-3 md:grid-cols-2">
                    <select name="sourceType" className="input w-full" defaultValue="auto">
                        <option value="auto">Auto-detect</option>
                        <option value="rss">RSS or Atom</option>
                        <option value="sitemap">Sitemap</option>
                        <option value="page">Public page</option>
                    </select>
                    <select name="crawlDepth" className="input w-full" defaultValue="0">
                        <option value="0">Only this URL</option>
                        <option value="1">Also same-site links</option>
                    </select>
                </div>
            </div>
            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        </form>
    );
}
