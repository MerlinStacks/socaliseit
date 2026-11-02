'use client';

/**
 * Recent bulk queueing batches with live progress.
 *
 * Polls only while something is in flight, so an idle settings page is quiet.
 */

import useSWR from 'swr';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { Loader2 } from 'lucide-react';
import { fetcher, type BatchSummary } from './client';
import { useQueueCache } from './use-queue-cache';

const ACTIVE = new Set(['PENDING', 'PROCESSING', 'CANCELLING']);

const STATUS_TONE: Record<string, string> = {
    COMPLETED: 'text-[var(--text-muted)]',
    PARTIAL: 'text-[var(--warning,var(--accent-gold))]',
    FAILED: 'text-[var(--error)]',
    PROCESSING: 'text-[var(--text-primary)]',
    PENDING: 'text-[var(--text-muted)]',
};

export function BulkBatchList() {
    const { key, invalidate } = useQueueCache();
    const [expanded, setExpanded] = useState<string | null>(null);
    const [pending, setPending] = useState<string | null>(null);
    const { data, mutate } = useSWR(key('batches'), fetcher.batches, {
        refreshInterval: (batches?: BatchSummary[]) => (batches?.some(batch => ACTIVE.has(batch.status)) ? 2000 : 0),
    });
    const progress = JSON.stringify(data?.map(batch => [batch.id, batch.status, batch.processedItems, batch.failedItems]));
    useEffect(() => { if (progress) void invalidate(false); }, [progress, invalidate]);

    async function cancel(id: string) {
        setPending(id);
        try {
            const response = await fetch(`/api/publishing-queues/bulk/${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error((await response.json()).error || 'Could not cancel the batch');
            toast('success', 'Cancellation requested', 'The worker will stop new placements and release pending schedules. Check batch details for any posts already publishing.');
            await mutate();
        } catch (error) {
            toast('error', 'Could not cancel the batch', error instanceof Error ? error.message : undefined);
        } finally { setPending(null); }
    }

    async function retry(id: string) {
        setPending(id);
        try {
            const response = await fetch(`/api/publishing-queues/bulk/${id}`, { method: 'POST' });
            if (!response.ok) throw new Error((await response.json()).error || 'Could not retry the batch');
            await mutate();
        } catch (error) {
            toast('error', 'Could not retry', error instanceof Error ? error.message : undefined);
        } finally { setPending(null); }
    }

    if (!data?.length) return null;

    return (
        <section className="space-y-3 border-t border-[var(--border)] pt-6">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Recent bulk queues</h4>
            <ul className="space-y-2">
                {data.slice(0, 6).map(batch => (
                    <li key={batch.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                        <span className="font-medium capitalize">{batch.kind.toLowerCase()}</span>
                        <span className="text-[var(--text-muted)]">
                            {batch.totalItems} row{batch.totalItems === 1 ? '' : 's'}
                            {batch.label ? ` · ${batch.label}` : ''}
                        </span>
                        <span className={STATUS_TONE[batch.status] ?? ''}>
                            {ACTIVE.has(batch.status)
                                ? `${batch.processedItems}/${batch.totalItems}`
                                : batch.status.toLowerCase()}
                            {batch.failedItems > 0 ? ` · ${batch.failedItems} failed` : ''}
                        </span>
                        {ACTIVE.has(batch.status) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        <span className="ml-auto text-xs text-[var(--text-muted)]">
                            {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(batch.createdAt))}
                        </span>
                        {ACTIVE.has(batch.status) && (
                            <Button size="sm" variant="ghost" disabled={pending === batch.id} onClick={() => cancel(batch.id)}>Cancel</Button>
                        )}
                        {(batch.status === 'FAILED' || batch.status === 'PARTIAL') && <Button size="sm" variant="ghost" disabled={pending === batch.id} onClick={() => retry(batch.id)}>Retry failed placements</Button>}
                        <Button size="sm" variant="ghost" aria-expanded={expanded === batch.id} onClick={() => setExpanded(current => current === batch.id ? null : batch.id)}>Details</Button>
                        {expanded === batch.id && <BatchDetails id={batch.id} active={ACTIVE.has(batch.status)} />}
                    </li>
                ))}
            </ul>
        </section>
    );
}

function BatchDetails({ id, active }: { id: string; active: boolean }) {
    const { key } = useQueueCache();
    const { data, error } = useSWR(key('batch', id), () => fetcher.batch(id), { refreshInterval: active ? 2000 : 0 });
    if (error) return <p role="alert">{error.message}</p>;
    return <div className="basis-full text-xs space-y-2">
        {data?.error && <p role="alert">{data.error}</p>}
        {data?.items.map(item => <div key={item.id}>
            <strong>{item.sourceName || `Row ${item.position + 1}`}: {item.status.toLowerCase()}</strong>
            {item.error && <p>{item.error}</p>}
            {item.placements.map(placement => <p key={placement.itemId}>{placement.queue}: {placement.status.toLowerCase()}</p>)}
        </div>)}
    </div>;
}
