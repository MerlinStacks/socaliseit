'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCheck, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { broadcastSync } from '@/lib/cross-tab-sync';
import ConversationThread from './conversation-thread';
import { InboxItem, InboxOptions, InboxWorkflow, conversationId, inboxKey, inboxRequest, jsonBody, safeInboxUrl, workflowTarget } from './inbox-model';
import { ReviewAiSuggestions } from './review-ai-suggestions';
import { SavedResponses } from './saved-responses';
import { useInboxDraft } from './use-inbox-draft';
import styles from './inbox.module.css';
import { InboxCollaboration } from './inbox-collaboration';
import { useInboxPresence } from './use-inbox-presence';
import { InboxPresence } from './inbox-presence';

export function InboxDetail({ item: initial, options, onBack, compact }: { item: InboxItem; options?: InboxOptions; onBack: () => void; compact: boolean }) {
    const client = useQueryClient();
    const { data: session } = useSession();
    const [tab, setTab] = useState<'conversation' | 'notes' | 'activity'>('conversation');
    const presence = useInboxPresence(initial, tab);
    const replying = () => presence.reportActivity('replying');
    const panel = useRef<HTMLDivElement>(null);
    const back = useRef<HTMLButtonElement>(null);
    const onBackRef = useRef(onBack);
    onBackRef.current = onBack;
    const detail = useQuery({
        queryKey: ['inbox-detail', session?.user?.currentOrganizationId, session?.user?.id, initial.type, initial.socialAccountId, initial.id],
        queryFn: () => inboxRequest<{ data: { workflow: InboxWorkflow; isRead: boolean; isReplied?: boolean; replyText?: string | null; text?: string | null; mediaUrl?: string | null } }>(`/api/inbox/${encodeURIComponent(initial.id)}?type=${initial.type}`),
    });
    const item: InboxItem = { ...initial, workflow: detail.data?.data.workflow || initial.workflow, isRead: detail.data?.data.isRead ?? initial.isRead,
        meta: initial.type === 'review' && detail.data ? { ...initial.meta, isReplied: detail.data.data.isReplied, replyText: detail.data.data.replyText } : initial.meta };
    useEffect(() => {
        back.current?.focus();
        if (!compact) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const trap = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); onBackRef.current(); }
            if (event.key !== 'Tab') return;
            const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]') || []).filter(el => el.getClientRects().length > 0);
            const first = elements[0], last = elements[elements.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        };
        document.addEventListener('keydown', trap);
        return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', trap); };
    }, [compact]);
    const refresh = () => {
        for (const key of ['inbox', 'inbox-detail', 'inbox-collaboration', 'unread-counts', 'reviews']) client.invalidateQueries({ queryKey: [key] });
        broadcastSync('inbox:updated');
    };
    const workflow = useMutation({
        mutationFn: (patch: Partial<InboxWorkflow>) => inboxRequest('/api/inbox/workflow', jsonBody({ ...workflowTarget(item), ...patch })),
        onSuccess: () => { refresh(); toast('success', 'Conversation updated'); },
        onError: error => toast('error', error.message),
    });
    const read = useMutation({
        mutationFn: () => inboxRequest(`/api/inbox/${encodeURIComponent(item.id)}`, jsonBody({ type: item.type, socialAccountId: item.socialAccountId, isRead: !item.isRead })),
        onSuccess: refresh, onError: error => toast('error', error.message),
    });
    const busy = workflow.isPending || detail.isFetching;
    return <section ref={panel} className={styles.detail} data-active="true" role={compact ? 'dialog' : 'region'} aria-modal={compact || undefined} aria-label={`Conversation with ${item.authorUsername}`}>
        <div className={styles.detailHeader}>
            <Button ref={back} variant="ghost" size="sm" onClick={onBack} aria-label="Back to conversation list"><ArrowLeft size={17} /><span className="ml-1">Back</span></Button>
            <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold truncate">{item.authorUsername}</h2><p className="text-[11px] truncate text-[var(--text-muted)]">{item.socialAccount.name} · {item.platform.toLowerCase().replaceAll('_', ' ')}</p></div>
            <Button size="sm" variant="ghost" disabled={read.isPending} onClick={() => read.mutate()} aria-label={item.isRead ? 'Mark unread' : 'Mark read'} title={item.isRead ? 'Mark unread' : 'Mark read'}><CheckCheck size={17} /></Button>
        </div>
        {detail.isError && <div role="alert" className="px-4 py-2 text-xs">Couldn’t refresh conversation details. <button className="underline" onClick={() => detail.refetch()}>Retry</button></div>}
        <InboxPresence {...presence} />
        <div className={styles.workflow}>
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs capitalize mr-auto">{item.workflow.status}{item.workflow.snoozedUntil && ` until ${new Date(item.workflow.snoozedUntil).toLocaleString()}`}</span>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => workflow.mutate({ status: item.workflow.status === 'open' ? 'resolved' : 'open', snoozedUntil: null })}>{item.workflow.status === 'open' ? 'Resolve' : 'Reopen'}</Button>
            </div>
            <details>
                <summary>Assignment, labels & snooze{item.workflow.assignedToId && ` · ${options?.members.find(member => member.id === item.workflow.assignedToId)?.name || 'Assigned'}`}{item.workflow.labelIds.length > 0 && ` · ${item.workflow.labelIds.length} labels`}</summary>
                <div className={styles.workflowGrid}>
                    <label>Assigned to<select disabled={!options || busy} value={item.workflow.assignedToId || ''} onChange={e => workflow.mutate({ assignedToId: e.target.value || null })}><option value="">Unassigned</option>{options?.members.map(member => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label>
                    <label>Snooze until<select aria-label="Snooze conversation" value="" disabled={busy} onChange={e => { if (e.target.value) workflow.mutate({ status: 'snoozed', snoozedUntil: new Date(Date.now() + Number(e.target.value) * 3600000).toISOString() }); }}><option value="">Choose time…</option><option value="1">In one hour</option><option value="24">In 24 hours</option><option value="168">In one week</option></select></label>
                </div>
                <fieldset disabled={!options || busy} className="mt-3"><legend className="text-xs mb-2">Labels</legend><div className="flex gap-3 flex-wrap">{options?.labels.length === 0 && <p className="text-xs text-[var(--text-muted)]">No workspace labels configured.</p>}{options?.labels.map(label => <label key={label.id} className="flex items-center gap-1.5"><input type="checkbox" checked={item.workflow.labelIds.includes(label.id)} onChange={e => workflow.mutate({ labelIds: e.target.checked ? [...item.workflow.labelIds, label.id] : item.workflow.labelIds.filter(id => id !== label.id) })} /><span className="h-2 w-2 rounded-full" style={{ background: label.color }} />{label.name}</label>)}</div></fieldset>
            </details>
        </div>
        <div role="tablist" aria-label="Conversation detail views" className="flex gap-1 border-b border-[var(--border)] px-3 py-2">
            {(['conversation', 'notes', 'activity'] as const).map((value, index, tabs) => <button key={value} role="tab" id={`inbox-tab-${value}`} aria-controls={`inbox-panel-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)} onKeyDown={event => {
                const next = event.key === 'ArrowRight' ? tabs[(index + 1) % tabs.length] : event.key === 'ArrowLeft' ? tabs[(index + tabs.length - 1) % tabs.length] : event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : undefined;
                if (next) { event.preventDefault(); setTab(next); document.getElementById(`inbox-tab-${next}`)?.focus(); }
            }} className={`rounded-lg px-3 py-2 text-xs font-semibold ${tab === value ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>{value === 'conversation' ? 'Conversation' : value === 'notes' ? 'Team notes' : 'Activity'}</button>)}
        </div>
        {tab !== 'conversation' ? <InboxCollaboration item={item} options={options} mode={tab} onComposerActivity={() => presence.reportActivity('noting')} /> : <div role="tabpanel" id="inbox-panel-conversation" aria-labelledby="inbox-tab-conversation" className="flex flex-col flex-1 min-h-0">
        {item.type === 'dm' || item.type === 'comment' ? <div className="flex-1 min-h-0"><ConversationThread onComposerActivity={replying} conversationId={conversationId(item)} type={item.type} platform={item.platform.toLowerCase()} socialAccountId={item.socialAccountId} recipientId={item.authorId || undefined} accountInfo={{ name: item.socialAccount.name, avatar: item.socialAccount.avatar }} /></div> :
            <div className={styles.content}>
                <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-4">{item.type === 'review' ? 'Original review' : `${item.meta.mentionType || 'Mention'} context`} · {new Date(item.createdAt).toLocaleString()}</p>
                {item.type === 'review' && <p className="text-lg font-semibold mb-3" aria-label={`${item.meta.rating} out of 5 stars`}>★ {item.meta.rating} <span className="text-sm text-[var(--text-muted)]">/ 5</span></p>}
                <p className="whitespace-pre-wrap break-words text-sm leading-7">{detail.data?.data.text ?? item.text ?? (item.type === 'review' ? 'This review has no written text.' : 'This mention has no text.')}</p>
                {item.type === 'mention' && <>
                    {safeInboxUrl(item.mediaUrl) && <a className="inline-flex items-center gap-2 underline text-sm mt-4" href={safeInboxUrl(item.mediaUrl)} target="_blank" rel="noopener noreferrer">View mention media <ExternalLink size={14} /></a>}
                    {safeInboxUrl(item.permalink) && <a className="block underline text-sm mt-4" href={safeInboxUrl(item.permalink)} target="_blank" rel="noopener noreferrer">View original mention</a>}
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4 mt-6 text-xs leading-6 text-[var(--text-secondary)]">This is a mention of {item.socialAccount.name}. Respond on the original platform; mentions do not have an in-app reply thread.{item.meta.platformPostId && <p className="break-all">Post reference: {item.meta.platformPostId}</p>}</div>
                </>}
                {item.type === 'review' && <ReviewReply item={item} onSuccess={refresh} onComposerActivity={replying} />}
            </div>}</div>}
    </section>;
}

function ReviewReply({ item, onSuccess, onComposerActivity }: { item: InboxItem; onSuccess: () => void; onComposerActivity: () => void }) {
    const draft = useInboxDraft(inboxKey(item));
    const insert = (text: string) => { draft.insert(text); onComposerActivity(); };
    const reply = useMutation({
        mutationFn: () => inboxRequest('/api/reviews/reply', jsonBody({ reviewId: item.meta.reviewId || item.id, text: draft.text.trim() }, 'POST')),
        onSuccess: () => { draft.update(''); onSuccess(); toast('success', 'Review reply posted'); },
        onError: error => toast('error', error.message),
    });
    return <div className="mt-5 space-y-4">
        {safeInboxUrl(item.meta.reviewUrl) && <a href={safeInboxUrl(item.meta.reviewUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex gap-2 items-center text-xs underline">View review on platform <ExternalLink size={13} /></a>}
        {item.meta.isReplied && <div className="border-l-2 border-[var(--accent-gold)] p-4 bg-[var(--bg-secondary)] rounded-r-lg"><h3 className="text-xs font-semibold mb-2">Your published reply</h3><p className="text-sm whitespace-pre-wrap">{item.meta.replyText || 'Reply published on platform.'}</p></div>}
        {!item.meta.isReplied && <div className="pt-4 border-t border-[var(--border)]">
            <p className="text-xs text-[var(--text-muted)] mb-3">Reply as {item.socialAccount.name} · Draft retained when switching conversations</p>
            <SavedResponses draft={draft.text} onInsert={insert} disabled={reply.isPending} />
            <textarea aria-label="Reply to review" className="w-full border border-[var(--border)] bg-[var(--bg-secondary)] rounded-lg p-3 text-sm min-h-28" placeholder="Write a thoughtful reply…" value={draft.text} disabled={reply.isPending} maxLength={4096} onChange={e => { draft.update(e.target.value); onComposerActivity(); }} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing && draft.text.trim() && !reply.isPending) { e.preventDefault(); reply.mutate(); } }} />
            <div className="flex justify-end mt-2"><Button disabled={!draft.text.trim() || reply.isPending} onClick={() => reply.mutate()}>{reply.isPending ? 'Sending…' : 'Send reply'}</Button></div>
            <ReviewAiSuggestions reviewText={item.text || ''} rating={item.meta.rating || 0} platform={item.platform} onSelect={insert} disabled={reply.isPending} />
        </div>}
    </div>;
}
