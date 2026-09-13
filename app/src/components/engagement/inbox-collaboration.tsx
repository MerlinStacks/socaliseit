'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { LockKeyhole, MessageSquareText, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InboxItem, InboxOptions, inboxKey, inboxRequest, workflowTarget } from './inbox-model';
import { CollaborationData, collaborationStream, editNoteDraft, isNotePending, readNoteDraft, submitInternalNote, subscribeNotePending } from './inbox-collaboration-model';
import { useInboxDraft } from './use-inbox-draft';
import styles from './inbox.module.css';

export function InboxCollaboration({ item, options, mode, onComposerActivity }: { item: InboxItem; options?: InboxOptions; mode: 'notes' | 'activity'; onComposerActivity?: () => void }) {
    const storage = useInboxDraft(inboxKey(item), 'internal-note');
    const draft = readNoteDraft(storage.text);
    const pending = useSyncExternalStore(subscribeNotePending, () => isNotePending(storage.key), () => false);
    const client = useQueryClient();
    const queryKey = ['inbox-collaboration', storage.key];
    const query = useInfiniteQuery({
        queryKey: [...queryKey, mode], enabled: storage.ready,
        initialPageParam: undefined as string | undefined,
        queryFn: ({ signal, pageParam }) => {
            const params = new URLSearchParams(workflowTarget(item));
            if (pageParam) params.set(mode === 'notes' ? 'noteCursor' : 'activityCursor', pageParam);
            return inboxRequest<{ data: CollaborationData }>(`/api/inbox/collaboration?${params}`, { signal });
        },
        getNextPageParam: (last, _pages, _param, params) => {
            const cursor = last.data.pagination?.[mode].nextCursor;
            return cursor && !params.includes(cursor) ? cursor : undefined;
        },
        refetchInterval: 15_000, refetchIntervalInBackground: false,
    });
    const post = useMutation({
        mutationFn: () => submitInternalNote(storage.key, item, draft, value => storage.update(value.body || value.mentionIds.length ? JSON.stringify(value) : '')),
        onSuccess: () => { void client.invalidateQueries({ queryKey }); },
    });
    const edit = (patch: Parameters<typeof editNoteDraft>[1]) => { storage.update(JSON.stringify(editNoteDraft(draft, patch))); post.reset(); onComposerActivity?.(); };
    const first = query.data?.pages[0].data;
    const notes = collaborationStream(query.data?.pages.map(page => page.data.notes) || []);
    const activity = collaborationStream(query.data?.pages.map(page => page.data.activity) || []);
    const writable = storage.ready && first?.canWrite === true && !query.isError && !pending;
    return <div className={styles.content} role="tabpanel" id={`inbox-panel-${mode}`} aria-labelledby={`inbox-tab-${mode}`}>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 mb-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole size={16} />{mode === 'notes' ? 'Internal notes' : 'Team activity'}</h3>
            <p className="mt-2 text-xs text-[var(--text-muted)]">Private to your team. Notes and mentions are never sent as public replies.</p>
        </div>
        {query.isLoading && <p role="status" className="text-sm">Loading {mode === 'notes' ? 'team notes' : 'activity'}…</p>}
        {query.isError && <div role="alert" className="text-sm mb-4">Couldn’t load {mode}: {query.error.message} <button className="underline" onClick={() => query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()}>Retry</button></div>}
        {query.data && <>
            <div className="flex justify-between gap-3 text-xs text-[var(--text-muted)] mb-3"><p aria-live="polite">{mode === 'notes' ? notes.length : activity.length} loaded · Newest first</p><button className="underline" disabled={query.isFetching} onClick={() => query.refetch()}>Refresh {mode}</button></div>
            {mode === 'notes' ? <div className="space-y-3">
                {!notes.length && <div className="py-6 text-center text-[var(--text-muted)]"><MessageSquareText className="mx-auto mb-2" /><p className="text-sm">No internal notes yet. Leave context for your team.</p></div>}
                {notes.map(note => <article key={note.id} className="rounded-xl border border-[var(--border)] p-4">
                    <div className="flex flex-wrap gap-2 justify-between text-xs"><strong>{note.authorName}</strong><time dateTime={note.createdAt} className="text-[var(--text-muted)]">{new Date(note.createdAt).toLocaleString()}</time></div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-6 mt-2">{note.body}</p>
                    {!!note.mentions.length && <p className="text-xs text-[var(--text-muted)] mt-3">Notified: {note.mentions.map(member => member.name).join(', ')}</p>}
                </article>)}
            </div> : <ol className="space-y-4">
                {!activity.length && <li className="py-6 text-center text-sm text-[var(--text-muted)]"><History className="mx-auto mb-2" />No team activity yet.</li>}
                {activity.map(event => <li key={event.id} className="border-l-2 border-[var(--border)] pl-4"><p className="text-sm"><strong>{event.actorName}</strong> · {event.description}</p><time dateTime={event.createdAt} className="text-xs text-[var(--text-muted)]">{new Date(event.createdAt).toLocaleString()}</time></li>)}
            </ol>}
            {query.hasNextPage && <Button className="mt-4" disabled={query.isFetching} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? `Loading more ${mode}…` : `Load more ${mode}`}</Button>}
        </>}
        {mode === 'notes' && <form className="mt-6 pt-4 border-t border-[var(--border)] space-y-3" onSubmit={event => { event.preventDefault(); if (writable && !post.isPending) post.mutate(); }}>
            <label className="block text-sm font-semibold" htmlFor="internal-note">Add a private note</label>
            {first?.canWrite === false && <p className="text-xs text-[var(--text-muted)]">You have read-only access to team collaboration.</p>}
            <textarea id="internal-note" value={draft.body} maxLength={5000} disabled={!writable || post.isPending} onChange={event => edit({ body: event.target.value })} placeholder="Share context, a handoff or a next step…" className="w-full min-h-28 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-sm" />
            <div className="text-right text-xs text-[var(--text-muted)]">{draft.body.length}/5000</div>
            <fieldset disabled={!writable || post.isPending || !options}>
                <legend className="text-xs mb-2">Notify teammates ({draft.mentionIds.length}/20)</legend>
                {!options && <p className="text-xs text-[var(--text-muted)]">Member options unavailable. Retry options above to select teammates.</p>}
                {options?.members.length === 0 && <p className="text-xs text-[var(--text-muted)]">No teammates available.</p>}
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">{options?.members.map(member => <label key={member.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2 py-1 text-xs"><input type="checkbox" checked={draft.mentionIds.includes(member.id)} disabled={!draft.mentionIds.includes(member.id) && draft.mentionIds.length >= 20} onChange={event => edit({ mentionIds: event.target.checked ? [...draft.mentionIds, member.id] : draft.mentionIds.filter(id => id !== member.id) })} />{member.name}</label>)}</div>
            </fieldset>
            {post.isError && <p role="alert" className="text-sm text-[var(--error)]">{post.error.message} Your draft is retained; retry to send this same note.</p>}
            {post.isSuccess && <p role="status" className="text-xs">Private note saved.</p>}
            <div className="flex justify-between items-center gap-3"><p className="text-xs text-[var(--text-muted)]">Private draft retained when switching.</p><Button type="submit" disabled={!writable || !draft.body.trim() || post.isPending}>{post.isPending ? 'Saving…' : post.isError ? 'Retry private note' : 'Add private note'}</Button></div>
        </form>}
    </div>;
}
