'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
    MessageSquare,
    AtSign,
    Mail,
    Check,
    CheckCheck,
    MoreHorizontal,
    RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { PlatformIcon } from '@/components/compose/profile-selector';
import type { Platform } from '@/lib/platform-config';

/**
 * InboxItem type from API
 */
interface InboxItem {
    id: string;
    type: 'comment' | 'mention' | 'dm';
    organizationId: string;
    platform: string;
    authorId: string;
    authorUsername: string;
    authorAvatar: string | null;
    text: string | null;
    mediaUrl?: string | null;
    isRead: boolean;
    assignedToId: string | null;
    labelIds: string[];
    sentiment?: string | null;
    createdAt: string;
    /** Why: Sort/display by latest activity, not original message time */
    lastActivityAt?: string;
    /** Why: Show "5 messages" for grouped DM conversations */
    messageCount?: number;
    /** Why: Show unread badge count on grouped conversations */
    unreadCount?: number;
    meta: {
        platformPostId?: string;
        platformCommentId?: string;
        platformMessageId?: string;
        conversationId?: string;
        direction?: string;
        mentionType?: string;
        isReplied?: boolean;
        parentId?: string | null;
    };
    socialAccount: {
        platform: string;
        name: string;
        avatar: string | null;
    };
}

interface InboxStreamProps {
    /** Filter by type */
    typeFilter?: 'all' | 'comment' | 'mention' | 'dm';
    /** Filter by platform */
    platformFilter?: string;
    /** Filter by read status */
    readFilter?: 'all' | 'read' | 'unread';
    /** Callback when an item is selected */
    onItemSelect?: (item: InboxItem) => void;
    /** Currently selected item ID */
    selectedItemId?: string;
}

/**
 * Type icon component
 */
function TypeIcon({ type }: { type: 'comment' | 'mention' | 'dm' }) {
    switch (type) {
        case 'comment':
            return <MessageSquare className="h-4 w-4 text-blue-500" />;
        case 'mention':
            return <AtSign className="h-4 w-4 text-purple-500" />;
        case 'dm':
            return <Mail className="h-4 w-4 text-green-500" />;
    }
}

/**
 * Sentiment badge component
 */
function SentimentBadge({ sentiment }: { sentiment?: string | null }) {
    if (!sentiment) return null;

    const variants: Record<string, string> = {
        positive: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
        negative: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
        neutral: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
        question: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    };

    return (
        <span className={cn('text-xs px-2 py-0.5 rounded-full', variants[sentiment])}>
            {sentiment}
        </span>
    );
}

/**
 * Compact inbox item card — shows just enough context to identify the conversation.
 * Why: Full message text was duplicating the right-panel conversation thread.
 */
function InboxItemCard({
    item,
    isSelected,
    onSelect,
    onMarkRead,
}: {
    item: InboxItem;
    isSelected: boolean;
    onSelect: () => void;
    onMarkRead: (id: string, type: string, isRead: boolean) => void;
}) {
    /** Why: Map raw type to a human-readable label for the subtitle row. */
    const typeLabel = item.type === 'dm' ? 'Direct Message' : item.type === 'mention' ? 'Mention' : 'Comment';

    return (
        <div
            onClick={onSelect}
            className={cn(
                'flex items-center gap-3 px-3 py-2.5 border-b cursor-pointer transition-all duration-150',
                'hover:bg-accent/50',
                isSelected
                    ? 'bg-accent/80 border-l-[3px] border-l-primary'
                    : 'border-l-[3px] border-l-transparent',
                !item.isRead && !isSelected && 'bg-primary/5'
            )}
        >
            {/* Author Avatar */}
            <Avatar className="h-9 w-9 shrink-0">
                <AvatarImage src={item.authorAvatar || undefined} />
                <AvatarFallback className="text-xs">
                    {item.authorUsername.charAt(0).toUpperCase()}
                </AvatarFallback>
            </Avatar>

            {/* Content — compact layout */}
            <div className="flex-1 min-w-0">
                {/* Row 1: Username + platform + time */}
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className={cn(
                            'text-sm truncate',
                            !item.isRead ? 'font-semibold' : 'font-medium'
                        )}>
                            {item.authorUsername}
                        </span>
                        <PlatformIcon platform={item.platform as Platform} size={14} />
                        {/* Why: Show unread count badge for grouped conversations with multiple unread */}
                        {(item.unreadCount ?? 0) > 1 && (
                            <Badge variant="default" className="h-4 min-w-[16px] px-1 text-[10px] leading-none rounded-full">
                                {item.unreadCount}
                            </Badge>
                        )}
                    </div>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                        {formatDistanceToNow(new Date(item.lastActivityAt || item.createdAt), { addSuffix: true })}
                    </span>
                </div>

                {/* Row 2: Single-line text preview */}
                <p className={cn(
                    'text-xs text-muted-foreground truncate mt-0.5',
                    !item.isRead && 'text-foreground/70'
                )}>
                    {item.text || <span className="italic">[Media message]</span>}
                </p>

                {/* Row 3: Type label + account name + message count + badges */}
                <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[11px] text-muted-foreground">
                        {typeLabel}
                    </span>
                    <span className="text-[11px] text-muted-foreground">·</span>
                    <span className="text-[11px] text-muted-foreground truncate">
                        {item.socialAccount.name}
                    </span>
                    {/* Why: Show message count for grouped conversations */}
                    {(item.messageCount ?? 0) > 1 && (
                        <>
                            <span className="text-[11px] text-muted-foreground">·</span>
                            <span className="text-[11px] text-muted-foreground">
                                {item.messageCount} messages
                            </span>
                        </>
                    )}
                    {item.meta.isReplied && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-300 ml-auto shrink-0">
                            ✓ Replied
                        </span>
                    )}
                </div>
            </div>

            {/* Unread dot + mark-read action */}
            <div className="flex flex-col items-center gap-1 shrink-0">
                {!item.isRead && (
                    <div className="w-2 h-2 rounded-full bg-primary" title="Unread" />
                )}
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        onMarkRead(item.id, item.type, !item.isRead);
                    }}
                    title={item.isRead ? 'Mark as unread' : 'Mark as read'}
                >
                    <Check className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    );
}

/**
 * Loading skeleton — matches the compact card height.
 */
function InboxItemSkeleton() {
    return (
        <div className="flex items-center gap-3 px-3 py-2.5 border-b">
            <Skeleton className="h-9 w-9 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-2.5 w-20" />
            </div>
        </div>
    );
}

/**
 * Main unified inbox stream component
 */
export default function UnifiedInboxStream({
    typeFilter = 'all',
    platformFilter,
    readFilter = 'all',
    onItemSelect,
    selectedItemId,
}: InboxStreamProps) {
    const queryClient = useQueryClient();
    const [page, setPage] = useState(1);

    // Build query params
    const queryParams = new URLSearchParams();
    queryParams.set('type', typeFilter);
    queryParams.set('page', page.toString());
    if (platformFilter) queryParams.set('platform', platformFilter);
    if (readFilter !== 'all') queryParams.set('isRead', readFilter === 'read' ? 'true' : 'false');

    // Fetch inbox items
    const {
        data,
        isLoading,
        isError,
        refetch,
        isFetching,
    } = useQuery({
        queryKey: ['inbox', typeFilter, platformFilter, readFilter, page],
        queryFn: async () => {
            const res = await fetch(`/api/inbox?${queryParams.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch inbox');
            return res.json() as Promise<{
                data: InboxItem[];
                pagination: { page: number; limit: number; total: number; totalPages: number };
                counts: { comments: number; mentions: number; dms: number };
            }>;
        },
        staleTime: 30 * 1000, // 30 seconds
        refetchInterval: 60 * 1000, // Auto-refresh every minute
    });

    // Mark as read mutation
    const markReadMutation = useMutation({
        mutationFn: async ({ id, type, isRead }: { id: string; type: string; isRead: boolean }) => {
            const res = await fetch(`/api/inbox/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, isRead }),
            });
            if (!res.ok) throw new Error('Failed to update');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['inbox'] });
        },
        onError: () => {
            toast('error', 'Failed to update item');
        },
    });

    const handleMarkRead = useCallback(
        (id: string, type: string, isRead: boolean) => {
            markReadMutation.mutate({ id, type, isRead });
        },
        [markReadMutation]
    );

    /** Why: Bulk triage — mark every visible item as read in one action */
    const markAllReadMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/inbox/mark-all-read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: typeFilter || 'all',
                    platform: platformFilter || null,
                }),
            });
            if (!res.ok) throw new Error('Failed to mark all read');
            return res.json();
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['inbox'] });
            toast('success', `Marked ${data.marked} items as read`);
        },
        onError: () => {
            toast('error', 'Failed to mark all as read');
        },
    });

    if (isError) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <p>Failed to load inbox</p>
                <Button variant="secondary" size="sm" className="mt-2" onClick={() => refetch()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header with counts */}
            {data && (
                <div className="flex items-center gap-4 p-4 border-b bg-background/95 backdrop-blur">
                    <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="gap-1">
                            <MessageSquare className="h-3 w-3" />
                            {data.counts.comments}
                        </Badge>
                        <Badge variant="secondary" className="gap-1">
                            <AtSign className="h-3 w-3" />
                            {data.counts.mentions}
                        </Badge>
                        <Badge variant="secondary" className="gap-1">
                            <Mail className="h-3 w-3" />
                            {data.counts.dms}
                        </Badge>
                    </div>
                    <div className="flex-1" />
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => markAllReadMutation.mutate()}
                        disabled={markAllReadMutation.isPending}
                        title="Mark all as read"
                        className="gap-1 text-xs"
                    >
                        <CheckCheck className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Read all</span>
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => refetch()}
                        disabled={isFetching}
                    >
                        <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
                    </Button>
                </div>
            )}

            {/* Item list */}
            <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                    <>
                        <InboxItemSkeleton />
                        <InboxItemSkeleton />
                        <InboxItemSkeleton />
                        <InboxItemSkeleton />
                        <InboxItemSkeleton />
                    </>
                ) : data?.data.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <MessageSquare className="h-12 w-12 mb-4 opacity-50" />
                        <p>No items in your inbox</p>
                        <p className="text-sm">Comments, mentions, and DMs will appear here</p>
                    </div>
                ) : (
                    data?.data.map((item) => (
                        <InboxItemCard
                            key={`${item.type}-${item.id}`}
                            item={item}
                            isSelected={selectedItemId === item.id}
                            onSelect={() => onItemSelect?.(item)}
                            onMarkRead={handleMarkRead}
                        />
                    ))
                )}
            </div>

            {/* Pagination */}
            {data && data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 p-4 border-t">
                    <Button
                        variant="secondary"
                        size="sm"
                        disabled={page === 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                        Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                        Page {page} of {data.pagination.totalPages}
                    </span>
                    <Button
                        variant="secondary"
                        size="sm"
                        disabled={page === data.pagination.totalPages}
                        onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                    >
                        Next
                    </Button>
                </div>
            )}
        </div>
    );
}
