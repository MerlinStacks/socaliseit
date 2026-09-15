'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, BarChart3, CheckCheck, Clock3, Inbox, MessageSquareText, UserRound, Users2 } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { broadcastSync } from '@/lib/cross-tab-sync';
import { CollabsInbox } from './collabs-inbox';
import { InboxConversationList, InboxPageData } from './inbox-conversation-list';
import { InboxDetail } from './inbox-detail';
import { InboxSyncButton } from './inbox-sync-button';
import { InboxReporting } from './inbox-reporting';
import { InboxEntity, InboxFilters, InboxItem, InboxOptions, InboxType, inboxKey, inboxParams, inboxRequest, jsonBody, legacyInboxType, normalizeInboxEntity, queues, typeNames, workflowTarget } from './inbox-model';
import styles from './inbox.module.css';

const queueIcons = { open: Inbox, mine: UserRound, all: Archive, snoozed: Clock3, resolved: CheckCheck };
export function EngagementInbox() {
    const params = useSearchParams();
    const { data: session } = useSession();
    // Remount on URL navigation so browser Back/legacy links clear panel and bulk selection.
    return <InboxWorkspace key={JSON.stringify([params.toString(), session?.user?.id, session?.user?.currentOrganizationId])} />;
}

function InboxWorkspace() {
    const params = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const client = useQueryClient();
    const { data: session } = useSession();
    const scope = [session?.user?.currentOrganizationId, session?.user?.id];
    const linkId = params.get('itemId');
    const linkType = params.get('type');
    const linkAccount = params.get('accountId');
    const validLink = !!linkId && !!linkAccount && ['comment', 'mention', 'dm', 'review'].includes(linkType || '');
    const [linkDismissed, setLinkDismissed] = useState(false);
    const linked = useQuery({
        queryKey: ['inbox-notification', ...scope, linkId, linkType, linkAccount],
        enabled: validLink && !linkDismissed && !!session?.user?.currentOrganizationId,
        queryFn: async ({ signal }) => {
            const result = await inboxRequest<{ data: InboxEntity }>(`/api/inbox/${encodeURIComponent(linkId!)}?${new URLSearchParams({ type: linkType!, socialAccountId: linkAccount! })}`, { signal });
            return normalizeInboxEntity(result.data, linkType as InboxType, linkAccount!);
        }, retry: false,
    });
    const collabs = params.get('tab') === 'collabs';
    const insights = params.get('tab') === 'insights';
    const [filters, setFilters] = useState<InboxFilters>(() => ({
        type: params.get('type') && Object.hasOwn(typeNames, params.get('type')!) ? params.get('type') as InboxFilters['type'] : legacyInboxType(params.get('tab')),
        queue: queues.find(queue => queue.id === params.get('queue'))?.id || 'open',
        q: '', socialAccountId: '', platform: '', sentiment: '',
    }));
    const [search, setSearch] = useState(filters.q);
    const [page, setPage] = useState(1);
    const [selection, setSelection] = useState<InboxItem | null>(null);
    const [checked, setChecked] = useState<Set<string>>(new Set());
    const [compact, setCompact] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement | null>(null);
    useEffect(() => {
        const node = root.current;
        if (!node) return;
        const measure = () => setCompact(node.clientWidth - 48 <= 700 || window.innerWidth < 768);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        return () => observer.disconnect();
    }, []);
    useEffect(() => {
        const timer = setTimeout(() => setSearch(filters.q), 300);
        return () => clearTimeout(timer);
    }, [filters.q]);
    const options = useQuery({ queryKey: ['inbox-options', ...scope], queryFn: () => inboxRequest<InboxOptions>('/api/inbox/options'), staleTime: 60_000 });
    const query = inboxParams({ ...filters, q: search }, page);
    const inbox = useQuery({
        queryKey: ['inbox', 'workspace', ...scope, query], enabled: !collabs && !insights,
        queryFn: ({ signal }) => inboxRequest<InboxPageData>(`/api/inbox?${query}`, { signal }),
        staleTime: 10_000, refetchInterval: 15_000, refetchIntervalInBackground: false,
    });
    const activeSelection = selection || (!linkDismissed ? linked.data : null);
    const selected = activeSelection && (inbox.data?.data.find(item => inboxKey(item) === inboxKey(activeSelection)) || activeSelection);
    const visibleChecked = new Set(inbox.data?.data.filter(item => checked.has(inboxKey(item))).map(inboxKey));
    const invalidate = () => {
        for (const key of ['inbox', 'inbox-detail', 'unread-counts', 'sidebar-badges']) client.invalidateQueries({ queryKey: [key] });
        broadcastSync('inbox:updated');
    };
    const bulk = useMutation({
        mutationFn: async (action: 'read' | 'resolve') => {
            const items = inbox.data?.data.filter(item => visibleChecked.has(inboxKey(item))) || [];
            if (!items.length) return;
            if (action === 'resolve') await inboxRequest('/api/inbox/workflow', jsonBody({ items: items.map(item => ({ ...workflowTarget(item), status: 'resolved', snoozedUntil: null })) }));
            else {
                const results = await Promise.allSettled(items.map(item => inboxRequest(`/api/inbox/${encodeURIComponent(item.id)}`, jsonBody({ type: item.type, socialAccountId: item.socialAccountId, isRead: true }))));
                const failed = results.filter(result => result.status === 'rejected').length;
                if (failed) throw new Error(`${items.length - failed} marked read; ${failed} failed. Retry the remaining unread conversations.`);
            }
        },
        onSuccess: (_data, action) => { setChecked(new Set()); toast('success', action === 'read' ? 'Selected conversations marked read' : 'Selected conversations resolved'); },
        onError: error => toast('error', error.message), onSettled: invalidate,
    });
    const changeFilters = (value: Partial<InboxFilters>) => {
        setLinkDismissed(true);
        setFilters(previous => ({ ...previous, ...value })); setPage(1); setChecked(new Set()); setSelection(null);
    };
    const navigateQueue = (queue: InboxFilters['queue'] | 'collabs' | 'insights') => {
        const next = new URLSearchParams(params.toString());
        next.delete('tab');
        next.delete('itemId'); next.delete('accountId');
        next.set('type', filters.type);
        if (queue === 'collabs' || queue === 'insights') next.set('tab', queue); else next.set('queue', queue);
        router.replace(`${pathname}?${next}`, { scroll: false });
    };
    const close = () => { setLinkDismissed(true); setSelection(null); requestAnimationFrame(() => trigger.current?.focus()); };
    const queue = queues.find(value => value.id === filters.queue)!;
    const hidden = compact && !!selected;
    return <div ref={root} className={styles.root}>
        <header className={styles.header} inert={hidden}><div><h1>Engagement inbox</h1><p>{insights ? 'Understand your inbox workload and ownership.' : collabs ? 'Manage your collaboration invitations.' : queue.description}</p></div><InboxSyncButton /></header>
        {options.isError && <div inert={hidden} role="alert" className="mb-3 rounded-lg border p-3 text-xs">Account, assignment and label options couldn’t load. <button className="underline" onClick={() => options.refetch()}>Retry options</button></div>}
        {linkId && !linkDismissed && !selected && <div role={linked.isError || !validLink ? 'alert' : 'status'} className="mb-3 rounded-lg border border-[var(--border)] p-3 text-sm">
            {!validLink ? 'This notification link is incomplete or invalid.' : linked.isError ? <>Couldn’t open this conversation: {linked.error.message} <button className="underline" onClick={() => linked.refetch()}>Retry</button></> : 'Opening notification conversation…'}
            <button className="underline ml-3" onClick={() => setLinkDismissed(true)}>Dismiss</button>
        </div>}
        <div className={styles.workspace}>
            <nav aria-label="Inbox queues" className={styles.queues} inert={hidden}>
                <p className={styles.queueHeading}>Your inbox</p>
                {queues.map(value => { const Icon = queueIcons[value.id]; return <button key={value.id} aria-current={!collabs && !insights && filters.queue === value.id ? 'page' : undefined} onClick={() => navigateQueue(value.id)}><Icon size={16} />{value.name}</button>; })}
                <button aria-current={insights ? 'page' : undefined} onClick={() => navigateQueue('insights')}><BarChart3 size={16} />Insights</button>
                <div className={styles.collabNav}><button aria-current={collabs ? 'page' : undefined} onClick={() => navigateQueue('collabs')}><Users2 size={16} />Collabs</button></div>
            </nav>
            {insights ? <InboxReporting options={options.data} /> : collabs ? <section className={styles.collabs}><h2 className="text-lg font-semibold mb-5">Collaboration invitations</h2><CollabsInbox /></section> : <>
                <div className="contents" inert={hidden}><InboxConversationList filters={filters} onFilter={changeFilters} options={options.data} data={inbox.data} loading={inbox.isLoading} error={inbox.isError} fetching={inbox.isFetching || search !== filters.q} onRetry={() => inbox.refetch()} selected={selected ? inboxKey(selected) : undefined}
                    onSelect={(item, button) => { setLinkDismissed(true); trigger.current = button; setSelection(item); }} checked={visibleChecked}
                    onCheck={key => setChecked(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; })}
                    onCheckAll={() => setChecked(visibleChecked.size === inbox.data?.data.length ? new Set() : new Set(inbox.data?.data.map(inboxKey)))}
                    onBulk={action => bulk.mutate(action)} busy={bulk.isPending} page={page} onPage={value => { setLinkDismissed(true); setPage(value); setChecked(new Set()); setSelection(null); }} /></div>
                {selected ? <InboxDetail key={inboxKey(selected)} item={selected} options={options.data} onBack={close} compact={compact} /> :
                    <section className={styles.detail} aria-label="Conversation detail"><div className={styles.empty}><MessageSquareText size={42} /><h3>A little attention goes a long way</h3><p>Select a conversation to see the context, send a reply and keep your team in sync.</p></div></section>}
            </>}
        </div>
    </div>;
}
