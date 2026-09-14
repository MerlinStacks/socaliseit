'use client';

import { formatDisplayDistance, resolveDisplayDate } from '@/lib/display-date';
import { AtSign, Mail, MessageSquare, Search, Star } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { InboxFilters, InboxItem, InboxOptions, inboxKey, typeNames } from './inbox-model';
import styles from './inbox.module.css';

export interface InboxPageData {
    data: InboxItem[];
    pagination: { page: number; total: number; totalPages: number };
}
const icons = { comment: MessageSquare, mention: AtSign, dm: Mail, review: Star };
export function InboxConversationList({ filters, onFilter, options, data, loading, error, fetching, onRetry, selected, onSelect, checked, onCheck, onCheckAll, onBulk, busy, page, onPage }: {
    filters: InboxFilters; onFilter: (value: Partial<InboxFilters>) => void; options?: InboxOptions;
    data?: InboxPageData; loading: boolean; error: boolean; fetching: boolean; onRetry: () => void;
    selected?: string; onSelect: (item: InboxItem, trigger: HTMLButtonElement) => void;
    checked: Set<string>; onCheck: (key: string) => void; onCheckAll: () => void;
    onBulk: (action: 'read' | 'resolve') => void; busy: boolean; page: number; onPage: (page: number) => void;
}) {
    const platforms = [...new Set(options?.accounts.map(account => account.platform) || [])];
    return <section className={styles.list} aria-label="Conversations" aria-busy={fetching}>
        <div className={styles.filters}>
            <label className={styles.search}><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search conversations" placeholder="Search messages or people" maxLength={500} value={filters.q} onChange={event => onFilter({ q: event.target.value })} /></label>
            <div className={styles.filterGrid}>
                <select aria-label="Conversation type" value={filters.type} onChange={e => onFilter({ type: e.target.value as InboxFilters['type'] })}>{Object.entries(typeNames).map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select>
                <select aria-label="Social account" value={filters.socialAccountId} onChange={e => onFilter({ socialAccountId: e.target.value })}><option value="">All accounts</option>{options?.accounts.map(account => <option key={account.id} value={account.id}>{account.name} · {account.platform.toLowerCase().replaceAll('_', ' ')}</option>)}</select>
                <select aria-label="Platform" value={filters.platform} onChange={e => onFilter({ platform: e.target.value })}><option value="">All platforms</option>{platforms.map(platform => <option value={platform} key={platform}>{platform.toLowerCase().replaceAll('_', ' ')}</option>)}</select>
                <select aria-label="Sentiment" value={filters.sentiment} onChange={e => onFilter({ sentiment: e.target.value })}><option value="">Any sentiment</option>{['positive', 'neutral', 'negative', 'question'].map(value => <option key={value}>{value}</option>)}</select>
            </div>
        </div>
        <div className={styles.listToolbar}>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" aria-label="Select all conversations on this page" disabled={!data?.data.length || busy || fetching} checked={!!data?.data.length && data.data.every(item => checked.has(inboxKey(item)))} onChange={onCheckAll} />{checked.size ? `${checked.size} selected` : `${data?.pagination.total ?? '—'} conversations`}</label>
            {checked.size > 0 && <div className="flex gap-1"><Button size="sm" variant="ghost" disabled={busy} onClick={() => onBulk('read')}>Read</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => onBulk('resolve')}>Resolve</Button></div>}
        </div>
        <div className={styles.rows}>
            {loading ? <div role="status" aria-label="Loading conversations">{Array.from({ length: 6 }, (_, i) => <div className="flex gap-3 p-4 border-b" key={i}><Skeleton className="h-10 w-10 rounded-full" /><div className="flex-1 space-y-3"><Skeleton className="h-3 w-2/3" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-1/2" /></div></div>)}</div> : error ?
                <div className={styles.empty} role="alert"><MessageSquare size={28} /><h3>Inbox couldn’t load</h3><p>Your conversations are still here. Please try again.</p><Button variant="secondary" onClick={onRetry}>Retry</Button></div> : !data?.data.length ?
                <div className={styles.empty}><MessageSquare size={32} /><h3>{filters.q || filters.type !== 'all' || filters.platform || filters.socialAccountId || filters.sentiment ? 'No matching conversations' : 'You’re all caught up'}</h3><p>Try another queue or adjust your filters. New activity appears here after syncing.</p></div> :
                data.data.map(item => {
                    const key = inboxKey(item);
                    const Icon = icons[item.type];
                    const activityDate = resolveDisplayDate(item.lastActivityAt, item.createdAt);
                    return <div className={styles.row} data-selected={key === selected} key={key}>
                        <input type="checkbox" className={styles.rowCheckbox} aria-label={`Select ${item.authorUsername} on ${item.socialAccount.name}`} checked={checked.has(key)} disabled={busy} onChange={() => onCheck(key)} />
                        <button className={styles.rowButton} aria-current={key === selected ? 'true' : undefined} onClick={event => onSelect(item, event.currentTarget)}>
                            <Avatar className="h-9 w-9 shrink-0"><AvatarImage src={item.authorAvatar || undefined} /><AvatarFallback colorSeed={item.authorUsername}>{item.authorUsername?.charAt(0).toUpperCase() || '?'}</AvatarFallback></Avatar>
                            <span className="min-w-0 flex-1 space-y-1 block">
                                <span className="flex items-start justify-between gap-2"><span className={`truncate text-sm ${!item.isRead ? 'font-bold' : 'font-medium'}`}>{item.authorUsername || 'Unknown author'}</span><time className={styles.time} dateTime={activityDate?.toISOString()}>{formatDisplayDistance(activityDate)}</time></span>
                                <span className="block line-clamp-2 text-xs text-[var(--text-secondary)]">{item.text || (item.type === 'review' ? 'Rating-only review' : 'Media attachment')}</span>
                                <span className="block truncate text-[11px] text-[var(--text-muted)]">{item.socialAccount.name} · {item.platform.toLowerCase().replaceAll('_', ' ')}</span>
                                <span className="flex flex-wrap items-center gap-1.5 pt-1">
                                    <span className={styles.badge}><Icon size={11} />{item.type === 'dm' ? 'DM' : item.type}{item.type === 'review' && item.meta.rating != null && ` · ${item.meta.rating}/5`}</span>
                                    {!item.isRead && <span className={styles.unread}>{item.unreadCount || 1} unread</span>}
                                    {(item.messageCount || 0) > 1 && <span className={styles.badge}>{item.messageCount} messages</span>}
                                    {item.meta.isReplied && <span className={styles.badge}>Replied</span>}
                                    {item.workflow.status !== 'open' && <span className={styles.badge}>{item.workflow.status}</span>}
                                </span>
                            </span>
                        </button>
                    </div>;
                })}
        </div>
        <div className={styles.pagination}>
            <Button size="sm" variant="ghost" disabled={page <= 1 || fetching || busy} onClick={() => onPage(page - 1)}>Previous</Button>
            <span className="text-xs" aria-live="polite">{page} / {Math.max(1, data?.pagination.totalPages || 1)}</span>
            <Button size="sm" variant="ghost" disabled={!data || page >= data.pagination.totalPages || fetching || busy} onClick={() => onPage(page + 1)}>Next</Button>
        </div>
    </section>;
}
