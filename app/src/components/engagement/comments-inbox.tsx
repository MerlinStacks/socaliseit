/**
 * Comments Inbox Component
 * Unified view for managing social comments with platform toggle filters and read/unread state
 *
 * Fixes applied:
 * - Added Content-Type headers to all JSON POST/PATCH requests
 * - Replaced `any` with typed interfaces for API data
 * - Consolidated duplicate read filter state (removed hideRead, readFilter now controls everything)
 * - Multi-platform filter sends first platform to API, client-side filters the rest
 * - Added pagination controls
 * - Removed unused imports (Card, CardContent)
 */

'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Loader2, MessageCircle, ThumbsUp, EyeOff, Send, MessageSquare, Check, Eye, CheckCheck } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/components/ui/toast';
import { PlatformToggleFilter } from './platform-toggle-filter';
import { PlatformIcon } from '@/components/compose/profile-selector';
import type { Platform } from '@/lib/platform-config';

// ============================================================================
// Types
// ============================================================================

interface SocialAccountRef {
    platform: string;
    name: string;
    avatar: string | null;
}

interface CommentReply {
    id: string;
    text: string;
    authorUsername: string;
    authorAvatar: string | null;
    socialAccount: SocialAccountRef;
}

interface CommentData {
    id: string;
    text: string;
    authorUsername: string;
    authorAvatar: string | null;
    likeCount: number;
    replyCount: number;
    isRead: boolean;
    isHidden: boolean;
    isReplied: boolean;
    sentiment: string | null;
    createdAt: string;
    socialAccount: SocialAccountRef;
    replies: CommentReply[];
}

interface CommentsResponse {
    data: CommentData[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

// ============================================================================
// Main Component
// ============================================================================

export function CommentsInbox() {
    const [platformFilter, setPlatformFilter] = useState<Platform[]>([]);
    const [sentimentFilter, setSentimentFilter] = useState<string>('all');
    const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('unread');
    const [page, setPage] = useState(1);
    // Bulk selection state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const queryClient = useQueryClient();

    // Fetch comments
    const { data, isLoading } = useQuery<CommentsResponse>({
        queryKey: ['comments', platformFilter, sentimentFilter, readFilter, page],
        queryFn: async () => {
            const params = new URLSearchParams({ page: page.toString() });

            // Platform filter — send first selected platform to API for server-side filtering.
            // If multiple platforms are selected, client-side filtering handles the rest below.
            if (platformFilter.length >= 1) {
                params.append('platform', platformFilter[0]);
            }

            if (sentimentFilter !== 'all') params.append('sentiment', sentimentFilter);

            // Consolidated read filter — single source of truth
            if (readFilter === 'unread') {
                params.append('isRead', 'false');
            } else if (readFilter === 'read') {
                params.append('isRead', 'true');
            }

            const res = await fetch(`/api/comments?${params}`);
            if (!res.ok) throw new Error('Failed to fetch comments');
            return res.json();
        },
        staleTime: 30 * 1000,
        refetchInterval: 60 * 1000,
        refetchIntervalInBackground: false,
    });

    // Bulk mark as read mutation
    const bulkReadMutation = useMutation({
        mutationFn: async (markAsRead: boolean) => {
            const body = selectedIds.size > 0
                ? { ids: Array.from(selectedIds), isRead: markAsRead }
                : { all: true, isRead: markAsRead };
            const res = await fetch('/api/comments/bulk-read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error('Failed to update comments');
            return res.json();
        },
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['comments'] });
            setSelectedIds(new Set());
            toast('success', `Marked ${result.updated} comments as read`);
        },
        onError: () => {
            toast('error', 'Failed to update comments');
        }
    });

    // Client-side filter for multi-platform selection (API only supports single platform)
    const filteredComments: CommentData[] = data?.data?.filter((comment) => {
        if (platformFilter.length <= 1) return true;
        return platformFilter.includes(comment.socialAccount.platform.toLowerCase() as Platform);
    }) || [];

    // Selection helpers
    const toggleSelection = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredComments.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredComments.map((c) => c.id)));
        }
    };

    const allSelected = filteredComments.length > 0 && selectedIds.size === filteredComments.length;

    const totalPages = data?.pagination?.totalPages || 1;

    return (
        <div className="space-y-6">
            {/* Filters Row */}
            <div className="flex gap-2 md:gap-4 items-center flex-wrap overflow-hidden">
                {/* Platform Toggle Buttons */}
                <PlatformToggleFilter
                    selected={platformFilter}
                    onChange={setPlatformFilter}
                />

                {/* Sentiment Filter */}
                <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
                    <SelectTrigger className="w-[110px] md:w-[140px] text-xs md:text-sm">
                        <SelectValue placeholder="Sentiment" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Sentiments</SelectItem>
                        <SelectItem value="positive">Positive</SelectItem>
                        <SelectItem value="neutral">Neutral</SelectItem>
                        <SelectItem value="negative">Negative</SelectItem>
                        <SelectItem value="question">Question</SelectItem>
                    </SelectContent>
                </Select>

                {/* Read Filter — single source of truth */}
                <Select value={readFilter} onValueChange={(v) => setReadFilter(v as 'all' | 'unread' | 'read')}>
                    <SelectTrigger className="w-[90px] md:w-[120px] text-xs md:text-sm">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="unread">Unread</SelectItem>
                        <SelectItem value="read">Read</SelectItem>
                    </SelectContent>
                </Select>

                {/* Bulk Actions — hidden on mobile */}
                <div className="hidden md:flex gap-2 ml-auto">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => bulkReadMutation.mutate(true)}
                        disabled={bulkReadMutation.isPending}
                        className="gap-2"
                    >
                        <CheckCheck className="h-4 w-4" />
                        {selectedIds.size > 0 ? `Mark ${selectedIds.size} Read` : 'Mark All Read'}
                    </Button>
                </div>
            </div>

            {/* Select All Row — desktop only */}
            {filteredComments.length > 0 && (
                <div className="hidden md:flex items-center gap-2 px-2">
                    <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleSelectAll}
                        id="select-all-comments"
                    />
                    <label htmlFor="select-all-comments" className="text-sm text-muted-foreground cursor-pointer">
                        {allSelected ? 'Deselect all' : 'Select all'}
                    </label>
                    {selectedIds.size > 0 && (
                        <span className="text-sm text-muted-foreground">
                            ({selectedIds.size} selected)
                        </span>
                    )}
                </div>
            )}

            {/* Comments List */}
            <div className="space-y-2 md:space-y-4">
                {isLoading ? (
                    <div className="flex justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : filteredComments.length === 0 ? (
                    <div className="text-center p-12 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
                        <div className="rounded-full p-4 mx-auto w-fit mb-4" style={{ background: 'var(--accent-gold-light)' }}>
                            <MessageSquare className="h-10 w-10" style={{ color: 'var(--accent-gold)', opacity: 0.7 }} />
                        </div>
                        <h3 className="text-lg font-medium">No comments found</h3>
                        <p style={{ color: 'var(--text-muted)' }}>Adjust your filters or sync new comments.</p>
                    </div>
                ) : (
                    filteredComments.map((comment) => (
                        <CommentItem
                            key={comment.id}
                            comment={comment}
                            isSelected={selectedIds.has(comment.id)}
                            onToggleSelect={() => toggleSelection(comment.id)}
                        />
                    ))
                )}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                    <Button
                        variant="secondary"
                        size="sm"
                        disabled={page === 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                        Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                        Page {page} of {totalPages}
                    </span>
                    <Button
                        variant="secondary"
                        size="sm"
                        disabled={page === totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                        Next
                    </Button>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// Comment Item Component
// ============================================================================

interface CommentItemProps {
    comment: CommentData;
    isSelected?: boolean;
    onToggleSelect?: () => void;
}

function CommentItem({ comment, isSelected, onToggleSelect }: CommentItemProps) {
    const [isReplying, setIsReplying] = useState(false);
    const [replyText, setReplyText] = useState('');
    const queryClient = useQueryClient();

    const replyMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch(`/api/comments/${comment.id}/reply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: replyText }),
            });
            if (!res.ok) throw new Error('Failed to reply');
            return res.json();
        },
        onSuccess: () => {
            toast('success', 'Reply sent!');
            setIsReplying(false);
            setReplyText('');
            queryClient.invalidateQueries({ queryKey: ['comments'] });
        },
        onError: () => {
            toast('error', 'Failed to send reply');
        }
    });

    const hideMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch(`/api/comments/${comment.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isHidden: !comment.isHidden }),
            });
            if (!res.ok) throw new Error('Failed to update comment');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['comments'] });
            toast('success', comment.isHidden ? 'Comment unhidden' : 'Comment hidden');
        }
    });

    const readMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch(`/api/comments/${comment.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isRead: !comment.isRead }),
            });
            if (!res.ok) throw new Error('Failed to update comment');
        },
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey: ['comments'] });
            const snapshot = queryClient.getQueriesData({ queryKey: ['comments'] });
            queryClient.setQueriesData({ queryKey: ['comments'] }, (old: unknown) => {
                const typed = old as CommentsResponse | undefined;
                if (!typed?.data) return old;
                return { ...typed, data: typed.data.map((c) => c.id === comment.id ? { ...c, isRead: !comment.isRead } : c) };
            });
            return { snapshot };
        },
        onError: (_err: unknown, _vars: unknown, ctx: { snapshot?: [unknown, unknown][] } | undefined) => {
            ctx?.snapshot?.forEach(([key, data]: [unknown, unknown]) => queryClient.setQueryData(key as string[], data));
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['comments'] });
            queryClient.invalidateQueries({ queryKey: ['unread-counts'] });
        },
    });

    return (
        <div
            className={cn(
                'glass-card overflow-hidden transition-all duration-200',
                comment.isHidden && 'opacity-60',
                !comment.isRead && !comment.isHidden && 'border-l-[3px]'
            )}
            style={{
                borderLeftColor: !comment.isRead && !comment.isHidden ? 'var(--accent-pink)' : undefined,
            }}
        >
            <div className="p-3 md:p-4">
                <div className="flex gap-3 md:gap-4">
                    {/* Selection Checkbox */}
                    {onToggleSelect && (
                        <div className="flex items-start pt-1">
                            <Checkbox
                                checked={isSelected}
                                onCheckedChange={onToggleSelect}
                            />
                        </div>
                    )}
                    <Avatar className="h-10 w-10">
                        <AvatarImage src={comment.authorAvatar || undefined} />
                        <AvatarFallback colorSeed={comment.authorUsername}>{comment.authorUsername[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold">{comment.authorUsername}</span>
                                <PlatformIcon platform={comment.socialAccount.platform.toLowerCase() as Platform} size={14} />
                                {comment.isHidden && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--error-light)', color: 'var(--error)' }}>Hidden</span>}
                                {!comment.isRead && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-gradient text-white">New</span>}
                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                    {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                                </span>
                            </div>
                        </div>

                        <p className="text-sm">{comment.text}</p>

                        <div className="flex items-center gap-4 pt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                            <span className="flex items-center gap-1">
                                <ThumbsUp className="h-3 w-3" /> {comment.likeCount}
                            </span>
                            <span className="flex items-center gap-1">
                                <MessageCircle className="h-3 w-3" /> {comment.replyCount}
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex gap-1 justify-end">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 interactive-scale"
                                onClick={() => readMutation.mutate(undefined)}
                                title={comment.isRead ? 'Mark as Unread' : 'Mark as Read'}
                            >
                                {comment.isRead ? <Eye className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 interactive-scale" onClick={() => hideMutation.mutate(undefined)}>
                                <EyeOff className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 interactive-scale" onClick={() => setIsReplying(!isReplying)}>
                                <MessageCircle className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                {isReplying && (
                    <div className="mt-3 md:mt-4 pl-0 md:pl-14 space-y-2">
                        <Textarea
                            placeholder="Write a reply..."
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            className="text-sm"
                            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
                            rows={2}
                        />
                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" size="sm" onClick={() => setIsReplying(false)}>Cancel</Button>
                            <button
                                onClick={() => replyMutation.mutate(undefined)}
                                disabled={!replyText || replyMutation.isPending}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-gradient text-white transition-all duration-200 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed btn-interactive"
                            >
                                {replyMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                                Reply
                            </button>
                        </div>
                    </div>
                )}

                {/* Render replies if loaded */}
                {comment.replies && comment.replies.length > 0 && (
                    <div className="mt-4 pl-14 space-y-4 ml-4" style={{ borderLeft: '2px solid var(--accent-gold-light)' }}>
                        {comment.replies.map((reply) => (
                            <div key={reply.id} className="flex gap-3">
                                <Avatar className="h-8 w-8">
                                    <AvatarImage src={reply.authorAvatar || undefined} />
                                    <AvatarFallback colorSeed={reply.authorUsername}>{reply.authorUsername[0]}</AvatarFallback>
                                </Avatar>
                                <div className="glass-card p-3 text-sm flex-1">
                                    <span className="font-semibold block">{reply.authorUsername}</span>
                                    {reply.text}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
