/**
 * UGC Curation Page
 * Discover user-generated content - shows real data when accounts connected
 */

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
    Heart, Users, Image as ImageIcon,
    Link as LinkIcon, CheckCircle, ExternalLink,
    MessageCircle, Share2, ThumbsUp, Filter, Search
} from 'lucide-react';
import { searchUGC, type UGCPost } from '@/lib/ugc';

export default async function UGCPage() {
    const session = await auth();

    if (!session?.user?.currentWorkspaceId) {
        redirect('/login');
    }

    const workspaceId = session.user.currentWorkspaceId;

    // Fetch connected accounts
    const socialAccounts = await db.socialAccount.findMany({
        where: { workspaceId, isActive: true },
    });

    const hasAccounts = socialAccounts.length > 0;

    // Fetch UGC if accounts are connected
    let ugcPosts: UGCPost[] = [];
    if (hasAccounts) {
        ugcPosts = await searchUGC(workspaceId, {
            platforms: socialAccounts.map(a => a.platform.toLowerCase()),
        });
    }

    return (
        <div className="flex h-screen flex-col">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-5">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient">
                        <Heart className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold">UGC Curation</h1>
                        <p className="text-sm text-[var(--text-muted)]">
                            Discover and manage user-generated content
                        </p>
                    </div>
                </div>
                {hasAccounts && (
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm">
                            <Filter className="h-4 w-4" />
                            Filter
                        </Button>
                        <Button variant="secondary" size="sm">
                            <Search className="h-4 w-4" />
                            Search Hashtags
                        </Button>
                    </div>
                )}
            </header>

            {/* Content */}
            <div className="flex-1 overflow-auto p-8">
                {!hasAccounts ? (
                    /* Empty State - No Accounts */
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center max-w-md">
                            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                                <Users className="h-10 w-10 text-[var(--accent-gold)]" />
                            </div>

                            <h2 className="mt-6 text-xl font-semibold">Connect Accounts to Find UGC</h2>
                            <p className="mt-2 text-[var(--text-muted)]">
                                Once connected, we&apos;ll automatically find posts where customers mention
                                your brand, making it easy to reshare and engage.
                            </p>

                            <div className="mt-8 space-y-3 text-left max-w-sm mx-auto">
                                <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                                    <CheckCircle className="h-5 w-5 text-[var(--text-muted)]" />
                                    <div>
                                        <p className="text-sm font-medium">Find Brand Mentions</p>
                                        <p className="text-xs text-[var(--text-muted)]">Automatically discover customer posts</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                                    <ImageIcon className="h-5 w-5 text-[var(--text-muted)]" />
                                    <div>
                                        <p className="text-sm font-medium">Request Permission</p>
                                        <p className="text-xs text-[var(--text-muted)]">Send DM templates for repost rights</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                                    <Heart className="h-5 w-5 text-[var(--text-muted)]" />
                                    <div>
                                        <p className="text-sm font-medium">Reshare Content</p>
                                        <p className="text-xs text-[var(--text-muted)]">Schedule approved UGC to your feed</p>
                                    </div>
                                </div>
                            </div>

                            <Link href="/settings?tab=integrations">
                                <Button className="mt-8">
                                    <LinkIcon className="h-4 w-4" />
                                    Connect Social Accounts
                                </Button>
                            </Link>
                        </div>
                    </div>
                ) : ugcPosts.length === 0 ? (
                    /* Empty State - No UGC Found */
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center max-w-md">
                            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                                <Heart className="h-10 w-10 text-[var(--accent-gold)]" />
                            </div>
                            <h2 className="mt-6 text-xl font-semibold">No UGC Found Yet</h2>
                            <p className="mt-2 text-[var(--text-muted)]">
                                We&apos;re monitoring your brand mentions. Check back soon or set up hashtag tracking!
                            </p>
                            <Button className="mt-6" variant="secondary">
                                <Search className="h-4 w-4" />
                                Search for Hashtags
                            </Button>
                        </div>
                    </div>
                ) : (
                    /* UGC Grid */
                    <div>
                        <div className="mb-6">
                            <p className="text-sm text-[var(--text-muted)]">
                                Found <span className="font-medium text-[var(--text-primary)]">{ugcPosts.length}</span> user-generated posts
                            </p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {ugcPosts.map((post) => (
                                <UGCCard key={post.id} post={post} />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * UGC Card Component
 * Displays individual UGC post with actions
 */
function UGCCard({ post }: { post: UGCPost }) {
    const statusColors: Record<string, string> = {
        pending: 'bg-[var(--warning-light)] text-[var(--warning)]',
        requested: 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)]',
        approved: 'bg-[var(--success-light)] text-[var(--success)]',
        denied: 'bg-[var(--error-light)] text-[var(--error)]',
        used: 'bg-[var(--accent-pink-light)] text-[var(--accent-pink)]',
    };

    return (
        <div className="card overflow-hidden">
            {/* Media Preview */}
            <div className="aspect-square bg-[var(--bg-tertiary)] relative">
                {post.mediaType === 'video' ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50">
                            <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        </div>
                    </div>
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <ImageIcon className="h-12 w-12 text-[var(--text-muted)]" />
                    </div>
                )}
                {/* Status Badge */}
                <span className={`absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-medium capitalize ${statusColors[post.status]}`}>
                    {post.status}
                </span>
            </div>

            {/* Content */}
            <div className="p-4">
                {/* Author */}
                <div className="flex items-center gap-2 mb-3">
                    <div className="h-8 w-8 rounded-full bg-gradient flex items-center justify-center">
                        <span className="text-white text-xs font-medium">
                            {post.authorDisplayName.charAt(0).toUpperCase()}
                        </span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{post.authorDisplayName}</p>
                        <p className="text-xs text-[var(--text-muted)]">@{post.authorUsername}</p>
                    </div>
                    <span className="text-xs text-[var(--text-muted)] capitalize">{post.platform}</span>
                </div>

                {/* Caption */}
                <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mb-3">
                    {post.caption}
                </p>

                {/* Engagement Stats */}
                <div className="flex items-center gap-4 text-xs text-[var(--text-muted)] mb-4">
                    <span className="flex items-center gap-1">
                        <ThumbsUp className="h-3 w-3" />
                        {post.engagement.likes.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1">
                        <MessageCircle className="h-3 w-3" />
                        {post.engagement.comments.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1">
                        <Share2 className="h-3 w-3" />
                        {post.engagement.shares.toLocaleString()}
                    </span>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                    <a href={post.postUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="secondary" className="flex-1">
                            <ExternalLink className="h-3 w-3" />
                            View
                        </Button>
                    </a>
                    {post.status === 'pending' && (
                        <Button size="sm" className="flex-1">
                            <MessageCircle className="h-3 w-3" />
                            Request
                        </Button>
                    )}
                    {post.status === 'approved' && (
                        <Button size="sm" className="flex-1">
                            <Heart className="h-3 w-3" />
                            Repost
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
