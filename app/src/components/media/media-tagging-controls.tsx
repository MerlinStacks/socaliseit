'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MediaItem } from '@/types/media';

type Settings = { enabled: boolean; canManage: boolean; configured: boolean };

export function MediaTaggingControls({ media, selectedIds, onUpdated }: {
    media: MediaItem[];
    selectedIds: string[];
    onUpdated: () => Promise<void>;
}) {
    const [settings, setSettings] = useState<Settings | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        fetch('/api/media/tagging').then(async response => {
            if (!response.ok) throw new Error('Could not load auto-tag settings.');
            const data = await response.json();
            if (active) setSettings(data);
        }).catch(err => { if (active) setError(err.message); });
        return () => { active = false; };
    }, []);

    const pending = media.filter(item => ['pending', 'processing'].includes(item.aiTagStatus ?? '')).length;
    const failed = media.filter(item => item.aiTagStatus === 'failed');
    const candidates = media.filter(item => /^(image|video)\//.test(item.mimeType)
        && !['pending', 'processing'].includes(item.aiTagStatus ?? '')
        && (selectedIds.length ? selectedIds.includes(item.id) : item.aiTagStatus !== 'completed'));

    async function toggle(enabled: boolean) {
        setBusy(true);
        setError('');
        try {
            const response = await fetch('/api/media/tagging', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not save auto-tag settings.');
            setSettings(previous => previous ? { ...previous, enabled: data.enabled } : previous);
        } catch (err) { setError(err instanceof Error ? err.message : 'Could not save settings.'); }
        finally { setBusy(false); }
    }

    async function analyze() {
        setBusy(true);
        setError('');
        setMessage('');
        let queued = 0;
        let failedCount = 0;
        try {
            // Bounded requests let large libraries report partial progress accurately.
            for (let offset = 0; offset < candidates.length; offset += 100) {
                const response = await fetch('/api/media/tagging', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: candidates.slice(offset, offset + 100).map(item => item.id) }),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Could not queue media analysis.');
                queued += data.queued;
                failedCount += data.failed;
                setMessage(`${queued} item(s) queued for analysis.${failedCount ? ` ${failedCount} could not be queued; try again.` : ''}`);
            }
        } catch (err) { setError(err instanceof Error ? err.message : 'Could not queue analysis.'); }
        finally { await onUpdated(); setBusy(false); }
    }

    return (
        <section aria-label="AI media tagging" className="border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-3">
                <Sparkles className="h-4 w-4 text-[var(--accent-gold)]" />
                <label className="flex items-center gap-2">
                    <input type="checkbox" checked={settings?.enabled ?? false} disabled={!settings?.canManage || busy}
                        onChange={event => toggle(event.target.checked)} />
                    Auto-tag uploads
                </label>
                <Button variant="secondary" size="sm" disabled={busy || !settings?.configured || candidates.length === 0} onClick={analyze}>
                    {busy ? 'Saving…' : selectedIds.length ? `Analyze selected (${candidates.length})` : `Analyze existing media (${candidates.length})`}
                </Button>
                {pending > 0 && <span role="status">Analyzing {pending} item(s)…</span>}
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
                AI reuses existing tags and adds new ones for images and videos. Tags stay editable.
                {' '}Analysis applies to {selectedIds.length ? 'selected items' : 'unanalyzed items in the current view'}.
                {settings && !settings.canManage && ' Workspace admins can change the upload setting.'}
                {settings && !settings.configured && ' Configure OpenRouter in AI settings to enable analysis.'}
            </p>
            {message && <p className="mt-2 text-xs" role="status">{message}</p>}
            {failed.length > 0 && <p className="mt-2 text-xs text-red-500">{failed.length} analysis failed. {failed[0].filename}: {failed[0].aiTagError} Use Analyze to retry.</p>}
            {error && <p className="mt-2 text-xs text-red-500" role="alert">{error}</p>}
        </section>
    );
}
