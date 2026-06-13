'use client';

import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Bell, ExternalLink, Search, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import ListeningLoading from './loading';
import { CreateMonitorForm, DeleteMonitorButton, ListeningClientActions } from './listening-client';

interface ListeningItem {
    id: string;
    platform: string;
    sourceType: string;
    externalUrl?: string;
    authorName?: string;
    content: string;
    mediaUrl?: string;
    sentiment: string;
    matchedKeywords: string[];
    isRead: boolean;
    occurredAt: string;
    monitor: { name: string };
}

interface ListeningMonitor {
    id: string;
    name: string;
    keywords: string[];
    isActive: boolean;
    lastSyncedAt?: string;
    _count: { items: number };
}

interface ListeningData {
    hasAccounts: boolean;
    platforms: string[];
    monitors: ListeningMonitor[];
    items: ListeningItem[];
    unreadCount: number;
    sentiment: Record<string, number>;
}

export default function ListeningSPAPage() {
    const { data, isLoading } = useQuery<ListeningData>({
        queryKey: ['listening-data'],
        queryFn: async () => {
            const res = await fetch('/api/listening/data');
            if (!res.ok) throw new Error('Failed to fetch listening data');
            return res.json();
        },
        staleTime: 60_000,
    });

    if (isLoading || !data) return <ListeningLoading />;

    return (
        <div className="flex h-screen flex-col">
            <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-5">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient">
                        <Search className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold">Social Listening</h1>
                        <p className="text-sm text-[var(--text-muted)]">Monitor keywords, mentions, comments, DMs, reviews, and sentiment.</p>
                    </div>
                </div>
                <ListeningClientActions unreadCount={data.unreadCount} />
            </header>

            <div className="flex-1 overflow-auto p-8">
                    <div className="mx-auto max-w-7xl space-y-6">
                        <div className="grid gap-4 md:grid-cols-3">
                            <MetricCard label="Active monitors" value={data.monitors.filter((monitor) => monitor.isActive).length} />
                            <MetricCard label="Listening results" value={data.items.length} />
                            <MetricCard label="Unread results" value={data.unreadCount} />
                        </div>

                        <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
                            <aside className="space-y-6">
                                <CreateMonitorForm />
                                <div className="card p-5">
                                    <h2 className="font-semibold">Monitors</h2>
                                    <div className="mt-4 space-y-3">
                                        {data.monitors.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No monitors configured yet.</p> : data.monitors.map((monitor) => (
                                            <div key={monitor.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="font-medium">{monitor.name}</p>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-[var(--text-muted)]">{monitor._count.items} results</span>
                                                        <DeleteMonitorButton monitorId={monitor.id} monitorName={monitor.name} />
                                                    </div>
                                                </div>
                                                <p className="mt-2 text-xs text-[var(--text-muted)]">{monitor.keywords.join(', ')}</p>
                                                {monitor.lastSyncedAt && <p className="mt-2 text-xs text-[var(--text-muted)]">Synced {formatDistanceToNow(new Date(monitor.lastSyncedAt), { addSuffix: true })}</p>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <Sentiment sentiment={data.sentiment} />
                            </aside>

                            <section className="space-y-4">
                                <h2 className="text-lg font-semibold">Latest listening results</h2>
                                {data.monitors.length === 0 ? (
                                    <EmptyState title="Create your first monitor" description="Add brand, competitor, product, or campaign keywords to start tracking conversations." />
                                ) : data.items.length === 0 ? (
                                    <EmptyState title="No listening results yet" description="Run Sync Listening after creating a monitor." />
                                ) : (
                                    <div className="space-y-3">{data.items.map((item) => <ResultCard key={item.id} item={item} />)}</div>
                                )}
                            </section>
                        </div>
                    </div>
            </div>
        </div>
    );
}

function MetricCard({ label, value }: { label: string; value: number }) {
    return <div className="card p-4"><p className="text-sm text-[var(--text-muted)]">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>;
}

function Sentiment({ sentiment }: { sentiment: Record<string, number> }) {
    return (
        <div className="card p-5">
            <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-[var(--accent-gold)]" /><h2 className="font-semibold">Sentiment</h2></div>
            <div className="mt-4 grid grid-cols-2 gap-3">
                {['positive', 'neutral', 'negative', 'question'].map((key) => <div key={key} className="rounded-lg bg-[var(--bg-tertiary)] p-3"><p className="text-xs capitalize text-[var(--text-muted)]">{key}</p><p className="text-lg font-semibold">{sentiment[key] || 0}</p></div>)}
            </div>
        </div>
    );
}

function ResultCard({ item }: { item: ListeningItem }) {
    return (
        <article className={`card p-4 ${!item.isRead ? 'border-l-4 border-l-[var(--accent-gold)]' : ''}`}>
            <div className="flex flex-wrap items-center gap-2">
                <Badge>{item.platform.toLowerCase()}</Badge><Badge>{item.sourceType}</Badge><Badge>{item.sentiment}</Badge>
                <span className="text-sm font-medium">{item.authorName || 'Unknown author'}</span>
                <span className="ml-auto text-xs text-[var(--text-muted)]">{formatDistanceToNow(new Date(item.occurredAt), { addSuffix: true })}</span>
            </div>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{item.content}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                <span>Monitor: {item.monitor.name}</span><span>Matched: {item.matchedKeywords.join(', ')}</span>
                {item.externalUrl && <a href={item.externalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--accent-gold)]"><ExternalLink className="h-3 w-3" />Open source</a>}
            </div>
        </article>
    );
}

function Badge({ children }: { children: ReactNode }) {
    return <span className="rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-xs capitalize text-[var(--text-muted)]">{children}</span>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
    return <div className="card flex min-h-72 items-center justify-center p-8 text-center"><div className="max-w-md"><Bell className="mx-auto h-10 w-10 text-[var(--accent-gold)]" /><h3 className="mt-4 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm text-[var(--text-muted)]">{description}</p></div></div>;
}
