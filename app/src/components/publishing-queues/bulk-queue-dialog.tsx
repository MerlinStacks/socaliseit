'use client';

/**
 * Bulk queueing dialog — the intake half of the feature.
 *
 * Three ways content arrives, one outcome: rows placed into the selected
 * profiles' queues.
 *
 * Files are uploaded through the existing /api/media endpoint rather than a new
 * bulk endpoint, because that path already streams to disk under backpressure,
 * enforces the size limits, and strips partial files on failure. Reimplementing
 * it for batches would have been the riskiest part of this feature.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { Loader2, Upload } from 'lucide-react';
import { MODE_LABELS, postJson, type FillMode, type QueueAccountOption } from './client';
import { useQueueCache } from './use-queue-cache';

type Source = 'library' | 'files' | 'csv';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    accounts: QueueAccountOption[];
    /** Media ids when opened from the library's multi-select. */
    mediaIds?: string[];
    defaultAccountId?: string;
    onQueued: () => void;
}

export function BulkQueueDialog({ open, onOpenChange, accounts, mediaIds, defaultAccountId, onQueued }: Props) {
    const { invalidate } = useQueueCache();
    const fileInput = useRef<HTMLInputElement>(null);
    const [source, setSource] = useState<Source>(mediaIds?.length ? 'library' : 'files');
    const [files, setFiles] = useState<File[]>([]);
    const [csv, setCsv] = useState('');
    const [caption, setCaption] = useState('');
    const [targets, setTargets] = useState<string[]>(defaultAccountId ? [defaultAccountId] : []);
    const [label, setLabel] = useState('');
    const [mode, setMode] = useState<FillMode>('AVAILABLE');
    const [busy, setBusy] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');
    const selection = mediaIds?.join('|') ?? '';
    useEffect(() => {
        if (!open) return;
        setTargets(defaultAccountId ? [defaultAccountId] : []);
        setSource(selection ? 'library' : 'files');
    }, [open, defaultAccountId, selection]);

    const availableLabels = useMemo(() => {
        const labels = new Set<string>();
        accounts.filter(account => targets.includes(account.id))
            .forEach(account => account.queues.forEach(queue => { if (queue.label) labels.add(queue.label); }));
        return [...labels].sort();
    }, [accounts, targets]);

    const rowCount = source === 'library' ? (mediaIds?.length ?? 0)
        : source === 'files' ? files.length
            : csv.trim().split('\n').slice(1).filter(Boolean).length;

    function reset() {
        setFiles([]); setCsv(''); setCaption(''); setUploadProgress('');
    }

    async function submit() {
        if (targets.length === 0) {
            toast('error', 'Choose at least one profile');
            return;
        }
        if (rowCount === 0 && source !== 'csv') {
            toast('error', 'Add something to queue first');
            return;
        }
        if (rowCount > 500) { toast('error', 'At most 500 rows can be queued at once'); return; }

        setBusy(true);
        try {
            let payload: Record<string, unknown>;
            if (source === 'csv') {
                payload = { kind: 'CSV', csv, socialAccountIds: targets, label: label || undefined, mode };
            } else if (source === 'library') {
                payload = {
                    kind: 'LIBRARY',
                    items: (mediaIds ?? []).map((id, index) => ({ mediaId: id, caption, sourceName: `Asset ${index + 1}` })),
                    socialAccountIds: targets, label: label || undefined, mode,
                };
            } else {
                // Existing upload path: one streamed upload per file, then batch them.
                const items: Array<{ mediaId: string; caption: string; sourceName: string }> = [];
                for (let index = 0; index < files.length; index++) {
                    setUploadProgress(`Uploading ${index + 1} of ${files.length}…`);
                    const body = new FormData();
                    body.append('file', files[index]);
                    const response = await fetch('/api/media', { method: 'POST', body });
                    if (!response.ok) {
                        const detail = await response.json().catch(() => ({}));
                        throw new Error(`${files[index].name}: ${detail.error || 'upload failed'}`);
                    }
                    const created = await response.json();
                    const id = created?.data?.id ?? created?.media?.id ?? created?.id;
                    if (!id) throw new Error(`${files[index].name}: upload did not return an asset`);
                    items.push({ mediaId: id, caption, sourceName: files[index].name });
                }
                payload = { kind: 'FILES', items, socialAccountIds: targets, label: label || undefined, mode };
            }

            const response = await postJson('/api/publishing-queues/bulk', 'POST', payload);
            if (!response.ok) throw new Error((await response.json()).error || 'Could not start the bulk queue');
            const result = (await response.json()).data as { batchId: string; totalItems: number };
            const warnings = (result as { warnings?: Array<{ warning: string }> }).warnings ?? [];
            toast(
                'success',
                `Queuing ${result.totalItems} row${result.totalItems === 1 ? '' : 's'} into ${targets.length} profile${targets.length === 1 ? '' : 's'}`,
                warnings[0]?.warning ?? 'Slots are being assigned now — watch progress below.',
            );
            reset();
            await invalidate();
            onQueued();
            onOpenChange(false);
        } catch (error) {
            toast('error', 'Bulk queue failed', error instanceof Error ? error.message : undefined);
        } finally {
            setBusy(false);
            setUploadProgress('');
        }
    }

    return (
        <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Queue content in bulk</DialogTitle>
                    <DialogDescription>
                        Rows are placed into the selected profiles&apos; time slots. The queue decides the times.
                    </DialogDescription>
                </DialogHeader>

                <fieldset disabled={busy} className="space-y-5 py-2">
                    <div className="flex gap-2">
                        {mediaIds?.length ? (
                            <SourceTab active={source === 'library'} onClick={() => setSource('library')} label={`Library (${mediaIds.length})`} />
                        ) : null}
                        <SourceTab active={source === 'files'} onClick={() => setSource('files')} label="Upload files" />
                        <SourceTab active={source === 'csv'} onClick={() => setSource('csv')} label="Spreadsheet" />
                    </div>

                    {source === 'library' && (
                        <p className="text-sm text-[var(--text-muted)]">
                            {mediaIds?.length ?? 0} selected asset{mediaIds?.length === 1 ? '' : 's'} from your library.
                        </p>
                    )}

                    {source === 'files' && (
                        <div className="space-y-2">
                            <button
                                type="button"
                                onClick={() => fileInput.current?.click()}
                                className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--border)] p-6 text-sm text-[var(--text-muted)] hover:border-[var(--accent-gold)]"
                            >
                                <Upload className="h-5 w-5" />
                                Drop files or click to choose
                            </button>
                            <input
                                ref={fileInput}
                                type="file"
                                multiple
                                accept="image/*,video/*"
                                className="hidden"
                                onChange={event => setFiles([...event.target.files ?? []])}
                            />
                            {files.length > 0 && (
                                <p className="text-xs text-[var(--text-muted)]">
                                    {files.length} file{files.length === 1 ? '' : 's'} · {files.reduce((sum, file) => sum + file.size, 0) > 0
                                        ? `${Math.round(files.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024)} MB` : '0 MB'}
                                </p>
                            )}
                        </div>
                    )}

                    {source === 'csv' && (
                        <div className="space-y-2">
                            <Textarea
                                value={csv}
                                onChange={event => setCsv(event.target.value)}
                                rows={7}
                                className="font-mono text-xs"
                                placeholder={'caption,media_urls\n"Launch week teaser",https://…/clip-1.mp4'}
                            />
                            <p className="text-xs text-[var(--text-muted)]">
                                Needs a <code>caption</code> column. <code>media_urls</code> must already be in your library.
                                Any <code>scheduled_date</code> in the file is ignored — the queue sets the time.
                            </p>
                        </div>
                    )}

                    {source !== 'csv' && (
                        <label className="block space-y-1">
                            <span className="text-xs font-medium text-[var(--text-muted)]">Caption for every row (editable per post afterwards)</span>
                            <Textarea value={caption} onChange={event => setCaption(event.target.value)} rows={2} />
                        </label>
                    )}

                    <div className="space-y-2">
                        <span className="text-xs font-medium text-[var(--text-muted)]">Profiles</span>
                        <div className="flex flex-wrap gap-2">
                            {accounts.map(account => (
                                <button
                                    key={account.id}
                                    type="button"
                                    aria-pressed={targets.includes(account.id)}
                                    onClick={() => setTargets(current => current.includes(account.id)
                                        ? current.filter(id => id !== account.id)
                                        : [...current, account.id])}
                                    className={`rounded-full border px-3 py-1 text-xs ${targets.includes(account.id)
                                        ? 'border-[var(--accent-gold)] bg-[var(--accent-gold-light)]'
                                        : 'border-[var(--border)] hover:border-[var(--accent-gold)]'}`}
                                >
                                    {account.name}
                                    {account.queues.length === 0 && ' (no queue)'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="space-y-1">
                            <span className="text-xs font-medium text-[var(--text-muted)]">Queue label</span>
                            <Input
                                value={label}
                                onChange={event => setLabel(event.target.value)}
                                placeholder={availableLabels[0] ? `one of: ${availableLabels.join(', ')}` : 'default'}
                            />
                        </label>
                        <label className="space-y-1">
                            <span className="text-xs font-medium text-[var(--text-muted)]">Placement</span>
                            <select
                                value={mode}
                                onChange={event => setMode(event.target.value as FillMode)}
                                className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 text-sm"
                            >
                                {(['AVAILABLE', 'LAST', 'NEXT'] as FillMode[]).map(option => (
                                    <option key={option} value={option}>{MODE_LABELS[option]}</option>
                                ))}
                            </select>
                        </label>
                    </div>
                </fieldset>

                <DialogFooter>
                    {uploadProgress && (
                        <span className="mr-auto flex items-center gap-2 text-xs text-[var(--text-muted)]">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {uploadProgress}
                        </span>
                    )}
                    <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={submit} disabled={busy || rowCount === 0}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Queue ${rowCount || ''} row${rowCount === 1 ? '' : 's'}`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function SourceTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${active
                ? 'bg-[var(--accent-gold-light)] font-medium'
                : 'text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]'}`}
        >
            {label}
        </button>
    );
}
