import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AtSign, Bell, ExternalLink, Link as LinkIcon, MessageCircle, Search, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getListeningDashboard } from '@/lib/services/social-listening';
import { CreateMonitorForm, ListeningClientActions } from './listening-client';

type ListeningDashboard = Awaited<ReturnType<typeof getListeningDashboard>>;
type ListeningItem = ListeningDashboard['items'][number];
type ListeningMonitor = ListeningDashboard['monitors'][number];

const SENTIMENT_LABELS = [
    { key: 'positive', label: 'Positive' },
    { key: 'neutral', label: 'Neutral' },
    { key: 'negative', label: 'Negative' },
    { key: 'question', label: 'Questions' },
];

export async function ListeningData({ organizationId }: { organizationId: string }) {
    const dashboard = await getListeningDashboard(organizationId);

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
                <ListeningClientActions unreadCount={dashboard.unreadCount} />
            </header>

            <div className="flex-1 overflow-auto p-8">
                    <div className="mx-auto max-w-7xl space-y-6">
                        <div className="grid gap-4 md:grid-cols-3">
                            <MetricCard label="Active monitors" value={dashboard.monitors.filter((monitor) => monitor.isActive).length} />
                            <MetricCard label="Listening results" value={dashboard.items.length} />
                            <MetricCard label="Unread results" value={dashboard.unreadCount} />
                        </div>

                        <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
                            <aside className="space-y-6">
                                <CreateMonitorForm />
                                <MonitorList monitors={dashboard.monitors} />
                                <SentimentSummary sentiment={dashboard.sentiment} />
                            </aside>

                            <section className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-lg font-semibold">Latest listening results</h2>
                                        <p className="text-sm text-[var(--text-muted)]">Matched from connected accounts and automatic web crawling.</p>
                                    </div>
                                </div>

                                {dashboard.monitors.length === 0 ? (
                                    <EmptyState title="Create your first monitor" description="Add brand, competitor, product, or campaign keywords to start tracking conversations." />
                                ) : dashboard.items.length === 0 ? (
                                    <EmptyState title="No listening results yet" description="Run Sync Listening after creating a monitor. Results appear when connected accounts or automatic crawling find matching conversations." />
                                ) : (
                                    <div className="space-y-3">
                                        {dashboard.items.map((item) => <ListeningResultCard key={item.id} item={item} />)}
                                    </div>
                                )}
                            </section>
                        </div>
                    </div>
            </div>
        </div>
    );
}

function MetricCard({ label, value }: { label: string; value: number }) {
    return (
        <div className="card p-4">
            <p className="text-sm text-[var(--text-muted)]">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
        </div>
    );
}

function MonitorList({ monitors }: { monitors: ListeningMonitor[] }) {
    return (
        <div className="card p-5">
            <h2 className="font-semibold">Monitors</h2>
            {monitors.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--text-muted)]">No monitors configured yet.</p>
            ) : (
                <div className="mt-4 space-y-3">
                    {monitors.map((monitor) => (
                        <div key={monitor.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-3">
                            <div className="flex items-center justify-between gap-3">
                                <p className="font-medium">{monitor.name}</p>
                                <span className="text-xs text-[var(--text-muted)]">{monitor._count.items} results</span>
                            </div>
                            <p className="mt-2 text-xs text-[var(--text-muted)]">{monitor.keywords.join(', ')}</p>
                            {monitor.lastSyncedAt && (
                                <p className="mt-2 text-xs text-[var(--text-muted)]">Synced {formatDistanceToNow(new Date(monitor.lastSyncedAt), { addSuffix: true })}</p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function SentimentSummary({ sentiment }: { sentiment: Record<string, number> }) {
    return (
        <div className="card p-5">
            <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[var(--accent-gold)]" />
                <h2 className="font-semibold">Sentiment</h2>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
                {SENTIMENT_LABELS.map(({ key, label }) => (
                    <div key={key} className="rounded-lg bg-[var(--bg-tertiary)] p-3">
                        <p className="text-xs text-[var(--text-muted)]">{label}</p>
                        <p className="text-lg font-semibold">{sentiment[key] || 0}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

function ListeningResultCard({ item }: { item: ListeningItem }) {
    return (
        <article className={`card p-4 ${!item.isRead ? 'border-l-4 border-l-[var(--accent-gold)]' : ''}`}>
            <div className="flex gap-4">
                {item.mediaUrl && (
                    <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-[var(--bg-tertiary)]">
                        <img src={item.mediaUrl} alt="" className="h-full w-full object-cover" />
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge>{item.platform.toLowerCase()}</Badge>
                        <Badge>{item.sourceType}</Badge>
                        <Badge>{item.sentiment}</Badge>
                        <span className="text-sm font-medium">{item.authorName || 'Unknown author'}</span>
                        <span className="ml-auto text-xs text-[var(--text-muted)]">{formatDistanceToNow(new Date(item.occurredAt), { addSuffix: true })}</span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">{item.content}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                        <span>Monitor: {item.monitor.name}</span>
                        <span>Matched: {item.matchedKeywords.join(', ')}</span>
                        {item.externalUrl && (
                            <a href={item.externalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--accent-gold)]">
                                <ExternalLink className="h-3 w-3" />
                                Open source
                            </a>
                        )}
                    </div>
                </div>
            </div>
        </article>
    );
}

function Badge({ children }: { children: ReactNode }) {
    return <span className="rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-xs capitalize text-[var(--text-muted)]">{children}</span>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
    return (
        <div className="card flex min-h-72 items-center justify-center p-8 text-center">
            <div className="max-w-md">
                <Bell className="mx-auto h-10 w-10 text-[var(--accent-gold)]" />
                <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-[var(--text-muted)]">{description}</p>
            </div>
        </div>
    );
}

function NoAccounts() {
    return (
        <div className="flex h-full items-center justify-center">
            <div className="max-w-md text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                    <Bell className="h-10 w-10 text-[var(--accent-gold)]" />
                </div>
                <h2 className="mt-6 text-xl font-semibold">Connect accounts for listening</h2>
                <p className="mt-2 text-[var(--text-muted)]">Social listening uses connected account engagement as its source stream.</p>
                <div className="mt-8 grid grid-cols-2 gap-4">
                    <Feature icon={<AtSign className="h-6 w-6" />} label="Mentions" />
                    <Feature icon={<MessageCircle className="h-6 w-6" />} label="Comments" />
                    <Feature icon={<TrendingUp className="h-6 w-6" />} label="Sentiment" />
                    <Feature icon={<Bell className="h-6 w-6" />} label="Alerts" />
                </div>
                <Link href="/settings?tab=integrations">
                    <Button className="mt-8">
                        <LinkIcon className="h-4 w-4" />
                        Connect Social Accounts
                    </Button>
                </Link>
            </div>
        </div>
    );
}

function Feature({ icon, label }: { icon: ReactNode; label: string }) {
    return (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
            <div className="mx-auto flex justify-center text-[var(--text-muted)]">{icon}</div>
            <p className="mt-2 text-sm font-medium">{label}</p>
        </div>
    );
}
