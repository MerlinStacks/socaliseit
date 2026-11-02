'use client';

/**
 * Publishing Queues settings.
 *
 * Two halves on one page, in the order people actually work: first define the
 * rhythm a profile posts on, then feed content into it in bulk. The queue only
 * ever supplies datetimes - the posts it creates go through the normal
 * scheduler, so anything already scheduled by hand stays exactly as it is.
 */

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { CalendarClock, Loader2, Plus, Trash2 } from 'lucide-react';
import { QueueSlotEditor } from './queue-slot-editor';
import { BulkQueueDialog } from './bulk-queue-dialog';
import { BulkBatchList } from './bulk-batch-list';
import { fetcher, postJson, describeDays, formatSlotTime, type QueueSlot } from './client';
import { useQueueCache } from './use-queue-cache';

export function PublishingQueueSettings() {
    const { key, invalidate } = useQueueCache();
    const { data: accounts, error } = useSWR(key('accounts'), fetcher.accounts);
    const [accountFilter, setAccountFilter] = useState<Record<string, string>>({});
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
    const [queueId, setQueueId] = useState<string | null>(null);
    const [slots, setSlots] = useState<QueueSlot[]>([]);
    const [label, setLabel] = useState('');
    const [labelOpen, setLabelOpen] = useState(false);
    const [newLabel, setNewLabel] = useState('');
    const [saving, setSaving] = useState(false);
    const [bulkOpen, setBulkOpen] = useState(false);

    const queues = useMemo(() => (accounts ?? []).flatMap(account => account.queues.map(queue => ({ ...queue, account }))), [accounts]);

    // Selecting a profile preloads its default queue; picking a labelled queue
    // loads that template instead.
    useEffect(() => {
        const available = queues.filter(candidate => candidate.account.id === selectedAccountId);
        const queue = available.find(candidate => candidate.id === accountFilter[selectedAccountId ?? ''])
            ?? available.find(candidate => !candidate.label) ?? available[0];
        setSlots(queue?.slots.map(slot => ({ daysOfWeek: slot.daysOfWeek, time: slot.time, enabled: slot.enabled !== false })) ?? []);
        setLabel(queue?.label ?? '');
        setQueueId(queue?.id ?? null);
    }, [accountFilter, queues, selectedAccountId]);

    const selectedAccount = (accounts ?? []).find(account => account.id === selectedAccountId);
    const queueOfAccount = queues.filter(queue => queue.account.id === selectedAccountId);

    async function save() {
        setSaving(true);
        try {
            const response = queueId
                ? await postJson(`/api/publishing-queues/${queueId}`, 'PATCH', { slots })
                : await postJson('/api/publishing-queues', 'POST', { socialAccountId: selectedAccountId, label, slots });
            if (!response.ok) throw new Error((await response.json()).error || 'Could not save the queue');
            const saved = (await response.json()).data as { id: string };
            if (selectedAccountId) setAccountFilter(current => ({ ...current, [selectedAccountId]: saved.id }));
            toast('success', 'Publishing queue saved', 'New content will be placed into these slots.');
            await invalidate();
        } catch (error) {
            toast('error', 'Could not save the queue', error instanceof Error ? error.message : undefined);
        } finally {
            setSaving(false);
        }
    }

    async function addLabel() {
        const name = newLabel.trim();
        if (!name) return;
        setNewLabel('');
        setLabelOpen(false);
        try {
            const response = await postJson('/api/publishing-queues', 'POST', {
                socialAccountId: selectedAccountId,
                label: name,
                slots: [{ daysOfWeek: [1, 2, 3, 4, 5], time: '09:00' }],
            });
            if (!response.ok) throw new Error((await response.json()).error || 'Could not create the queue');
            const saved = (await response.json()).data as { id: string };
            if (selectedAccountId) setAccountFilter(current => ({ ...current, [selectedAccountId]: saved.id }));
            await invalidate();
            toast('success', `Queue "${name}" created`, 'Add its time slots, then save.');
        } catch (error) {
            toast('error', 'Could not create the queue', error instanceof Error ? error.message : undefined);
        }
    }

    async function removeQueue(id: string) {
        if (!window.confirm('Delete this queue? Posts already scheduled from it keep their times.')) return;
        try {
            const response = await fetch(`/api/publishing-queues/${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error((await response.json()).error || 'Could not delete the queue');
            const result = (await response.json()).data;
            toast('success', 'Queue deleted', result.leftScheduled ? `${result.leftScheduled} scheduled posts keep their times.` : undefined);
            setQueueId(null);
            setSlots([]);
            setAccountFilter(current => Object.fromEntries(Object.entries(current).filter(([, value]) => value !== id)));
            await invalidate();
        } catch (error) {
            toast('error', 'Could not delete the queue', error instanceof Error ? error.message : undefined);
        }
    }

    if (error) return <div className="card p-6 text-sm text-[var(--error)]">{error.message}</div>;

    return (
        <div className="card space-y-6 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="flex items-center gap-2 font-semibold">
                        <CalendarClock className="h-5 w-5 text-[var(--accent-gold)]" /> Publishing queues
                    </h3>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                        Set the days and times each profile posts. Bulk content fills those slots automatically, so
                        nobody has to pick publish times one post at a time.
                    </p>
                </div>
                <Button onClick={() => setBulkOpen(true)}>Queue content in bulk</Button>
            </div>

            {!accounts && !error ? (
                <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading queues…
                </div>
            ) : !accounts?.length ? (
                <p className="text-sm text-[var(--text-muted)]">Connect a social profile first.</p>
            ) : (
                <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
                    <div className="space-y-1">
                        <p className="px-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Profiles</p>
                        {accounts.map(account => (
                            <button
                                key={account.id}
                                type="button"
                                onClick={() => { setSelectedAccountId(account.id); setAccountFilter(current => ({ ...current, [account.id]: current[account.id] ?? account.queues[0]?.id ?? '' })); }}
                                aria-pressed={selectedAccountId === account.id}
                                className={`w-full rounded-lg px-2 py-2 text-left text-sm transition-colors ${selectedAccountId === account.id
                                    ? 'bg-[var(--accent-gold-light)] font-medium'
                                    : 'hover:bg-[var(--bg-tertiary)]'}`}
                            >
                                <span className="block truncate">{account.name}</span>
                                <span className="block text-xs text-[var(--text-muted)]">
                                    {account.platform.toLowerCase()} · {account.queues.length} queue{account.queues.length === 1 ? '' : 's'}
                                </span>
                            </button>
                        ))}
                    </div>

                    <div className="space-y-5">
                        {!selectedAccount ? (
                            <p className="text-sm text-[var(--text-muted)]">Choose a profile to edit its queue.</p>
                        ) : (
                            <>
                                <div className="flex flex-wrap items-center gap-2">
                                    {queueOfAccount.map(queue => (
                                        <button
                                            key={queue.id}
                                            type="button"
                                            aria-pressed={accountFilter[selectedAccount.id] === queue.id}
                                            onClick={() => setAccountFilter(current => ({ ...current, [selectedAccount.id]: queue.id }))}
                                            className={`rounded-full border px-3 py-1 text-xs transition-colors ${accountFilter[selectedAccount.id] === queue.id
                                                ? 'border-[var(--accent-gold)] bg-[var(--accent-gold-light)]'
                                                : 'border-[var(--border)] hover:border-[var(--accent-gold)]'}`}
                                        >
                                            {queue.label || 'Default'}
                                        </button>
                                    ))}
                                    <Button size="sm" variant="ghost" onClick={() => setLabelOpen(true)}>
                                        <Plus className="mr-1 h-3.5 w-3.5" /> Label
                                    </Button>
                                    {labelOpen && (
                                        <span className="flex items-center gap-2">
                                            <Input
                                                autoFocus
                                                value={newLabel}
                                                onChange={event => setNewLabel(event.target.value)}
                                                placeholder="weekends, promos…"
                                                className="w-36"
                                                aria-label="New queue label"
                                            />
                                            <Button size="sm" onClick={addLabel} disabled={!newLabel.trim()}>Add</Button>
                                            <Button size="sm" variant="ghost" onClick={() => { setLabelOpen(false); setNewLabel(''); }}>Cancel</Button>
                                        </span>
                                    )}
                                </div>

                                <QueueSlotEditor slots={slots} onChange={setSlots} />

                                {slots.length > 0 && slots[0].daysOfWeek.length > 0 && (
                                    <p className="text-xs text-[var(--text-muted)]">
                                        Repeats {describeDays(slots[0].daysOfWeek).toLowerCase()} at {slots[0].time}
                                        {slots.length > 1 ? ` and ${slots.length - 1} more slot${slots.length === 2 ? '' : 's'}` : ''}.
                                    </p>
                                )}

                                <div className="flex flex-wrap items-center gap-3">
                                    <Button onClick={save} disabled={saving || slots.length === 0}>
                                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save queue'}
                                    </Button>
                                    {queueId && (
                                        <Button variant="ghost" onClick={() => removeQueue(queueId)}>
                                            <Trash2 className="mr-2 h-4 w-4" /> Delete this queue
                                        </Button>
                                    )}
                                </div>

                                <QueuePreview accountId={selectedAccount.id} label={label} />
                            </>
                        )}
                    </div>
                </div>
            )}

            <BulkBatchList />

            <BulkQueueDialog
                open={bulkOpen}
                onOpenChange={setBulkOpen}
                accounts={accounts ?? []}
                defaultAccountId={selectedAccountId ?? undefined}
                onQueued={() => {}}
            />
        </div>
    );
}

function QueuePreview({ accountId, label }: { accountId: string; label: string }) {
    const { key } = useQueueCache();
    const { data } = useSWR(
        key('preview', accountId, label),
        () => fetch(`/api/publishing-queues/items?socialAccountId=${accountId}&label=${encodeURIComponent(label)}&limit=14`, { cache: 'no-store' })
            .then(response => response.json())
            .then(payload => payload.data as { queue: { timezone: string }; preview: Array<{ at: string; taken: boolean }> }),
    );

    if (!data?.preview?.length) return null;

    return (
        <div className="rounded-xl border border-[var(--border)] p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Next slots</p>
            <ul className="flex flex-wrap gap-2">
                {data.preview.map(slot => (
                    <li
                        key={slot.at}
                        title={slot.taken ? 'Filled' : 'Open'}
                        className={`rounded-lg px-2.5 py-1.5 text-xs ${slot.taken
                            ? 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] line-through'
                            : 'bg-[var(--accent-gold-light)] text-[var(--text-primary)]'}`}
                    >
                        {formatSlotTime(slot.at, data.queue.timezone)}
                    </li>
                ))}
            </ul>
        </div>
    );
}
