'use client';

/**
 * Listening SPA page — client-side wrapper for SPA shell navigation.
 */

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { SPALink } from '@/components/ui/spa-link';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import {
    Search, Bell, MessageCircle, AtSign,
    Link as LinkIcon, TrendingUp,
    ExternalLink, Tag,
} from 'lucide-react';
import { ListeningClientActions } from './listening-client';
import ListeningLoading from './loading';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MentionCard({ mention }: { mention: any }) {
    const typeIcon = mention.type === 'MENTION' ? (
        <AtSign className="h-4 w-4" />
    ) : (
        <Tag className="h-4 w-4" />
    );
    const typeLabel = mention.type === 'MENTION' ? '@mention' : 'tagged';
    const postUrl = `https://instagram.com/p/${mention.platformPostId}`;

    return (
        <div className={`card p-4 ${!mention.isRead ? 'border-l-4 border-l-[var(--accent-gold)]' : ''}`}>
            <div className="flex gap-4">
                {mention.mediaUrl && (
                    <div className="flex-shrink-0 h-20 w-20 rounded-lg bg-[var(--bg-tertiary)] overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={mention.mediaUrl} alt="" className="h-full w-full object-cover" />
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-xs">
                                {typeIcon}
                                {typeLabel}
                            </span>
                            <span className="text-sm font-medium">@{mention.authorUsername}</span>
                            {!mention.isRead && (
                                <span className="h-2 w-2 rounded-full bg-[var(--accent-gold)]" />
                            )}
                        </div>
                        <span className="text-xs text-[var(--text-muted)]">
                            {formatDistanceToNow(new Date(mention.createdAt), { addSuffix: true })}
                        </span>
                    </div>
                    {mention.text && (
                        <p className="mt-2 text-sm text-[var(--text-secondary)] line-clamp-2">{mention.text}</p>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                        <a href={postUrl} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="secondary">
                                <ExternalLink className="h-3 w-3" />
                                View Post
                            </Button>
                        </a>
                        <span className="text-xs text-[var(--text-muted)] capitalize">
                            {mention.socialAccount?.platform?.toLowerCase() || 'instagram'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function ListeningSPAPage() {
    const { data, isLoading } = useQuery({
        queryKey: ['listening-data'],
        queryFn: async () => {
            const res = await fetch('/api/listening/data');
            if (!res.ok) throw new Error('Failed to fetch listening data');
            return res.json();
        },
        staleTime: 2 * 60_000,
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
                        <p className="text-sm text-[var(--text-muted)]">Monitor brand mentions and sentiment</p>
                    </div>
                </div>
                {data.hasInstagram && (
                    <ListeningClientActions unreadCount={data.unreadCount} />
                )}
            </header>

            <div className="flex-1 overflow-auto p-8">
                {!data.hasAccounts ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center max-w-md">
                            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                                <Bell className="h-10 w-10 text-[var(--accent-gold)]" />
                            </div>
                            <h2 className="mt-6 text-xl font-semibold">Connect Accounts for Listening</h2>
                            <p className="mt-2 text-[var(--text-muted)]">
                                Monitor what people are saying about your brand across social platforms in real-time once you connect your accounts.
                            </p>
                            <div className="mt-8 grid grid-cols-2 gap-4">
                                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                                    <AtSign className="mx-auto h-6 w-6 text-[var(--text-muted)]" />
                                    <p className="mt-2 text-sm font-medium">Brand Mentions</p>
                                    <p className="text-xs text-[var(--text-muted)]">Track @mentions</p>
                                </div>
                                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                                    <MessageCircle className="mx-auto h-6 w-6 text-[var(--text-muted)]" />
                                    <p className="mt-2 text-sm font-medium">Comments</p>
                                    <p className="text-xs text-[var(--text-muted)]">Monitor engagement</p>
                                </div>
                                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                                    <TrendingUp className="mx-auto h-6 w-6 text-[var(--text-muted)]" />
                                    <p className="mt-2 text-sm font-medium">Sentiment</p>
                                    <p className="text-xs text-[var(--text-muted)]">Analyze mood</p>
                                </div>
                                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                                    <Bell className="mx-auto h-6 w-6 text-[var(--text-muted)]" />
                                    <p className="mt-2 text-sm font-medium">Alerts</p>
                                    <p className="text-xs text-[var(--text-muted)]">Real-time notifications</p>
                                </div>
                            </div>
                            <SPALink href="/settings?tab=integrations">
                                <Button className="mt-8">
                                    <LinkIcon className="h-4 w-4" />
                                    Connect Social Accounts
                                </Button>
                            </SPALink>
                        </div>
                    </div>
                ) : !data.hasInstagram ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center max-w-md">
                            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                                <Bell className="h-10 w-10 text-[var(--accent-gold)]" />
                            </div>
                            <h2 className="mt-6 text-xl font-semibold">Connect Instagram for Listening</h2>
                            <p className="mt-2 text-[var(--text-muted)]">
                                Social Listening currently requires an Instagram Business account. Connect one to monitor mentions and tags.
                            </p>
                            <SPALink href="/settings?tab=integrations">
                                <Button className="mt-6">
                                    <LinkIcon className="h-4 w-4" />
                                    Connect Instagram
                                </Button>
                            </SPALink>
                        </div>
                    </div>
                ) : data.mentions.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center max-w-md">
                            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                                <Bell className="h-10 w-10 text-[var(--accent-gold)]" />
                            </div>
                            <h2 className="mt-6 text-xl font-semibold">No Mentions Yet</h2>
                            <p className="mt-2 text-[var(--text-muted)]">
                                Click the Sync button to fetch your latest mentions and tags from Instagram.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div>
                        <div className="mb-6 flex items-center justify-between">
                            <p className="text-sm text-[var(--text-muted)]">
                                Showing <span className="font-medium text-[var(--text-primary)]">{data.mentions.length}</span> of {data.totalMentions} mentions
                                {data.unreadCount > 0 && (
                                    <span className="ml-2 text-[var(--accent-gold)]">({data.unreadCount} unread)</span>
                                )}
                            </p>
                        </div>
                        <div className="space-y-4">
                            {data.mentions.map((mention: any) => (
                                <MentionCard key={mention.id} mention={mention} />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
