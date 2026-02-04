/**
 * UGC Client Wrapper
 * Client-side component that handles UGC search state and API calls
 */
'use client';

import { useState, useCallback } from 'react';
import { UGCSearchForm } from './ugc-search';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
    Heart, ThumbsUp, MessageCircle, Share2,
    ExternalLink, Image as ImageIcon, Loader2
} from 'lucide-react';

export interface UGCPostClientData {
    id: string;
    platform: string;
    postUrl: string;
    authorUsername: string;
    authorDisplayName: string;
    caption: string;
    mediaUrls: string[];
    mediaType: 'image' | 'video' | 'carousel';
    engagement: {
        likes: number;
        comments: number;
        shares: number;
    };
    publishedAt: string;
    status: string;
    tags: string[];
}

interface UGCClientWrapperProps {
    hasAccounts: boolean;
    organizationId: string;
}

export function UGCClientWrapper({ hasAccounts, organizationId }: UGCClientWrapperProps) {
    const [ugcPosts, setUgcPosts] = useState<UGCPostClientData[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSearch = useCallback(async (hashtags: string[]) => {
        setIsSearching(true);
        setError(null);

        try {
            const response = await fetch('/api/ugc/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hashtags }),
            });

            if (!response.ok) {
                throw new Error('Failed to search for UGC');
            }

            const data = await response.json();
            setUgcPosts(data.posts || []);
            setHasSearched(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setIsSearching(false);
        }
    }, []);

    if (!hasAccounts) {
        return null; // Parent handles empty state
    }

    return (
        <div>
            {/* Hashtag Search Form */}
            <UGCSearchForm onSearch={handleSearch} isSearching={isSearching} />

            {/* Error Message */}
            {error && (
                <div className="mb-4 p-4 rounded-lg bg-[var(--error-light)] text-[var(--error)] text-sm">
                    {error}
                </div>
            )}

            {/* Results */}
            {hasSearched && (
                <>
                    {ugcPosts.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                                <Heart className="h-8 w-8 text-[var(--text-muted)]" />
                            </div>
                            <h3 className="mt-4 text-lg font-medium">No UGC Found</h3>
                            <p className="mt-2 text-sm text-[var(--text-muted)]">
                                Try searching for different hashtags or check back later.
                            </p>
                        </div>
                    ) : (
                        <div>
                            <p className="text-sm text-[var(--text-muted)] mb-4">
                                Found <span className="font-medium text-[var(--text-primary)]">{ugcPosts.length}</span> user-generated posts
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {ugcPosts.map((post) => (
                                    <UGCCardClient key={post.id} post={post} />
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Initial State - No search yet */}
            {!hasSearched && !isSearching && (
                <div className="text-center py-12">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                        <Heart className="h-8 w-8 text-[var(--accent-gold)]" />
                    </div>
                    <h3 className="mt-4 text-lg font-medium">Search for User-Generated Content</h3>
                    <p className="mt-2 text-sm text-[var(--text-muted)] max-w-md mx-auto">
                        Enter hashtags above to discover posts from your customers and fans.
                        Great UGC can be reshared to build authentic engagement.
                    </p>
                </div>
            )}

            {/* Loading State */}
            {isSearching && (
                <div className="text-center py-12">
                    <Loader2 className="h-10 w-10 animate-spin text-[var(--accent-gold)] mx-auto" />
                    <p className="mt-4 text-sm text-[var(--text-muted)]">
                        Searching Instagram for UGC...
                    </p>
                </div>
            )}
        </div>
    );
}

/**
 * UGC Card Component (Client Version)
 */
function UGCCardClient({ post }: { post: UGCPostClientData }) {
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
                {post.mediaUrls[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={post.mediaUrls[0]}
                        alt={post.caption || 'UGC Post'}
                        className="w-full h-full object-cover"
                    />
                ) : post.mediaType === 'video' ? (
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
                <span className={`absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-medium capitalize ${statusColors[post.status] || statusColors.pending}`}>
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

                {/* Tags */}
                {post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                        {post.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="text-xs text-[var(--accent-gold)]">
                                #{tag}
                            </span>
                        ))}
                    </div>
                )}

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
                    {post.engagement.shares > 0 && (
                        <span className="flex items-center gap-1">
                            <Share2 className="h-3 w-3" />
                            {post.engagement.shares.toLocaleString()}
                        </span>
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                    <a href={post.postUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                        <Button size="sm" variant="secondary" className="w-full">
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
                </div>
            </div>
        </div>
    );
}
