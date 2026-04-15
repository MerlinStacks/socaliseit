/**
 * Instagram Grid Planner Component
 *
 * Renders a 3-column grid preview matching Instagram's profile layout.
 * Scheduled/draft posts appear at the top; published posts flow below.
 * Pending posts can be drag-and-dropped to reorder their grid position.
 *
 * Why: High-demand feature for Instagram-focused users to visualize how
 * their feed will look with upcoming posts mixed into existing content.
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Layers, Play, Clock, ImageIcon, AlertCircle, RefreshCcw, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDragDropGrid } from '@/hooks/use-drag-drop-grid';
import { showErrorToast } from '@/lib/api-error';
import type { GridPost } from '@/app/api/instagram/grid/route';

interface GridAccount {
    id: string;
    username: string;
    avatarUrl: string | null;
}

interface GridPlannerProps {
    accounts: Array<{ id: string; platform: string; name: string }>;
    onPostClick: (postId: string) => void;
}

export function GridPlanner({ accounts, onPostClick }: GridPlannerProps) {
    const instagramAccounts = accounts.filter(a => a.platform === 'instagram');
    const [selectedAccountId, setSelectedAccountId] = useState<string>(instagramAccounts[0]?.id || '');
    const [grid, setGrid] = useState<GridPost[]>([]);
    const [gridAccount, setGridAccount] = useState<GridAccount | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchGrid = useCallback(async (accountId: string) => {
        if (!accountId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/instagram/grid?accountId=${accountId}&limit=60`);
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || `Failed to fetch grid (${res.status})`);
            }
            const data = await res.json();
            if (!Array.isArray(data.grid)) {
                throw new Error('Invalid response format from server');
            }
            setGrid(data.grid);
            setGridAccount(data.account || null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load grid');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (selectedAccountId) fetchGrid(selectedAccountId);
    }, [selectedAccountId, fetchGrid]);

    // Split grid into pending (draggable) and published (locked) sections
    const pendingPosts = useMemo(() => grid.filter(p => p.status === 'scheduled' || p.status === 'draft'), [grid]);
    const publishedPosts = useMemo(() => grid.filter(p => p.status === 'published'), [grid]);

    // Drag-drop for reordering pending posts
    const { dragState, handlers: dragHandlers } = useDragDropGrid({
        onReorder: async (postId, newScheduledAt) => {
            try {
                const response = await fetch(`/api/posts/${postId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'reschedule', scheduledAt: newScheduledAt.toISOString() }),
                });
                if (!response.ok) throw new Error('Failed to reschedule');
                // Optimistic reorder: re-fetch to get server-confirmed order
                await fetchGrid(selectedAccountId);
            } catch (err) {
                showErrorToast(err, 'Failed to reorder post');
            }
        },
    });

    if (instagramAccounts.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center">
                <ImageIcon className="mb-3 h-10 w-10 text-[var(--text-muted)]" />
                <p className="mb-1 text-lg font-medium">No Instagram accounts</p>
                <p className="text-sm text-[var(--text-muted)]">Connect an Instagram account to use the grid planner.</p>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-2xl">
            {/* Account Selector */}
            {instagramAccounts.length > 1 && (
                <div className="mb-4">
                    <select
                        value={selectedAccountId}
                        onChange={(e) => setSelectedAccountId(e.target.value)}
                        className="rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                    >
                        {instagramAccounts.map(a => (
                            <option key={a.id} value={a.id}>@{a.name}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* Profile Header */}
            {gridAccount && (
                <div className="mb-4 flex items-center gap-3">
                    {gridAccount.avatarUrl ? (
                        <img
                            src={gridAccount.avatarUrl}
                            alt={gridAccount.username}
                            className="h-10 w-10 rounded-full object-cover"
                        />
                    ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                            <ImageIcon className="h-5 w-5" />
                        </div>
                    )}
                    <div>
                        <p className="text-sm font-semibold">@{gridAccount.username}</p>
                        <p className="text-xs text-[var(--text-muted)]">
                            {publishedPosts.length} posts
                            {pendingPosts.length > 0 && (
                                <> &middot; {pendingPosts.length} upcoming</>
                            )}
                        </p>
                    </div>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="grid grid-cols-3 gap-1">
                    {Array.from({ length: 9 }).map((_, i) => (
                        <div key={i} className="aspect-square animate-pulse rounded bg-[var(--bg-tertiary)]" />
                    ))}
                </div>
            )}

            {/* Error */}
            {error && !loading && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <AlertCircle className="mb-3 h-8 w-8 text-[var(--text-muted)]" />
                    <p className="mb-1 text-sm font-medium">{error}</p>
                    <button
                        onClick={() => fetchGrid(selectedAccountId)}
                        className="mt-2 flex items-center gap-1 text-xs text-[var(--accent-gold)] hover:underline"
                    >
                        <RefreshCcw className="h-3 w-3" /> Retry
                    </button>
                </div>
            )}

            {/* Grid */}
            {!loading && !error && grid.length > 0 && (
                <div className="grid grid-cols-3 gap-1">
                    {/* Pending posts — draggable */}
                    {pendingPosts.map((post, index) => (
                        <GridCell
                            key={post.id}
                            post={post}
                            onClick={() => onPostClick(post.id)}
                            draggable
                            isDraggedOver={dragState.overIndex === index}
                            isDragging={dragState.draggedPostId === post.id}
                            onDragStart={(e) => dragHandlers.onDragStart(post.id, e)}
                            onDragOver={(e) => dragHandlers.onDragOver(index, e)}
                            onDragLeave={dragHandlers.onDragLeave}
                            onDrop={(e) => dragHandlers.onDrop(pendingPosts, index, e)}
                            onDragEnd={dragHandlers.onDragEnd}
                        />
                    ))}

                    {/* Published posts — locked */}
                    {publishedPosts.map((post) => (
                        <GridCell
                            key={post.id}
                            post={post}
                            onClick={() => onPostClick(post.id)}
                        />
                    ))}
                </div>
            )}

            {/* Drag hint */}
            {!loading && !error && pendingPosts.length > 1 && (
                <p className="mt-3 text-center text-xs text-[var(--text-muted)]">
                    Drag scheduled posts to reorder how they appear in your grid
                </p>
            )}

            {/* Empty */}
            {!loading && !error && grid.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <ImageIcon className="mb-3 h-8 w-8 text-[var(--text-muted)]" />
                    <p className="mb-1 text-sm font-medium">No posts yet</p>
                    <p className="text-xs text-[var(--text-muted)]">Sync your Instagram posts or schedule new ones to see them here.</p>
                </div>
            )}
        </div>
    );
}

/** Individual grid cell matching Instagram's square aspect ratio */
function GridCell({
    post,
    onClick,
    draggable = false,
    isDraggedOver = false,
    isDragging = false,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
}: {
    post: GridPost;
    onClick: () => void;
    draggable?: boolean;
    isDraggedOver?: boolean;
    isDragging?: boolean;
    onDragStart?: (e: React.DragEvent) => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDragLeave?: () => void;
    onDrop?: (e: React.DragEvent) => void;
    onDragEnd?: () => void;
}) {
    const isPending = post.status === 'scheduled' || post.status === 'draft';

    return (
        <div
            className={cn(
                'group relative aspect-square overflow-hidden bg-[var(--bg-tertiary)] transition-all cursor-pointer',
                isPending && 'ring-2 ring-inset ring-blue-400/60',
                isDraggedOver && 'ring-2 ring-inset ring-[var(--accent-gold)] scale-[0.96]',
                isDragging && 'opacity-40',
            )}
            title={post.caption.slice(0, 100) || 'No caption'}
            draggable={draggable}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
            onClick={onClick}
        >
            {/* Thumbnail */}
            {post.thumbnailUrl ? (
                <img
                    src={post.thumbnailUrl}
                    alt={post.caption.slice(0, 100) || 'Post'}
                    className={cn(
                        'h-full w-full object-cover',
                        isPending && 'opacity-80',
                    )}
                    loading="lazy"
                    draggable={false}
                />
            ) : (
                <div className="flex h-full w-full items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-[var(--text-muted)]" />
                </div>
            )}

            {/* Drag handle (top-right, pending posts only) */}
            {draggable && (
                <div className="absolute right-1 top-1 rounded bg-black/40 p-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <GripVertical className="h-3.5 w-3.5 text-white" />
                </div>
            )}

            {/* Media type overlay (top-right, shifted left when drag handle visible) */}
            {(post.mediaType === 'carousel' || post.mediaType === 'reel' || post.mediaType === 'video') && (
                <div className={cn('absolute top-1.5', draggable ? 'right-7' : 'right-1.5')}>
                    {post.mediaType === 'carousel' && <Layers className="h-4 w-4 text-white drop-shadow-md" />}
                    {(post.mediaType === 'reel' || post.mediaType === 'video') && <Play className="h-4 w-4 text-white drop-shadow-md" />}
                </div>
            )}

            {/* Status badge (top-left for pending posts) */}
            {isPending && (
                <div className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-blue-500/80 px-1.5 py-0.5">
                    <Clock className="h-3 w-3 text-white" />
                    <span className="text-[10px] font-medium text-white">
                        {post.status === 'draft' ? 'Draft' : 'Scheduled'}
                    </span>
                </div>
            )}

            {/* Drop indicator line */}
            {isDraggedOver && (
                <div className="absolute inset-y-0 left-0 w-1 bg-[var(--accent-gold)]" />
            )}

            {/* Hover overlay with caption */}
            <div className="absolute inset-0 flex items-end bg-black/0 transition-colors group-hover:bg-black/40">
                <p className="w-full truncate px-2 py-1.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {post.caption.slice(0, 60) || 'No caption'}
                </p>
            </div>
        </div>
    );
}
