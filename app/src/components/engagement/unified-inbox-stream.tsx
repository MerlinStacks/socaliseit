'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
    MessageSquare,
    AtSign,
    Mail,
    Check,
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
 * Single inbox item card
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
    return (
        <div
            onClick={onSelect}
            className={cn(
                'flex items-start gap-3 p-4 border-b cursor-pointer transition-colors',
                'hover:bg-accent/50',
                isSelected && 'bg-accent',
                !item.isRead && 'bg-primary/5'
            )}
        >
            {/* Author Avatar */}
            <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage src={item.authorAvatar || undefined} />
                <AvatarFallback>
                    {item.authorUsername.charAt(0).toUpperCase()}
                </AvatarFallback>
            </Avatar>

            {/* Content */}
            <div className="flex-1 min-w-0">
                {/* Header: Username, type, platform */}
                <div className="flex items-center gap-2 mb-1">
                    <span className={cn('font-medium truncate', !item.isRead && 'font-semibold')}>
                        {item.authorUsername}
                    </span>
                    <TypeIcon type={item.type} />
                    <PlatformIcon platform={item.platform as Platform} size={16} />
                    <SentimentBadge sentiment={item.sentiment} />
                </div>

                {/* Text content */}
                <p className="text-sm text-muted-foreground line-clamp-2 mb-1">
                    {item.text || <span className="italic">[Media message]</span>}
                </p>

                {/* Footer: Time, account name */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
                    <span>•</span>
                    <span className="truncate">{item.socialAccount.name}</span>
                    {item.meta.isReplied && (
                        <>
                            <span>•</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Replied</span>
                        </>
                    )}
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
                {!item.isRead && (
                    <div className="w-2 h-2 rounded-full bg-primary" title="Unread" />
                )}

                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        onMarkRead(item.id, item.type, !item.isRead);
                    }}
                    title={item.isRead ? 'Mark as unread' : 'Mark as read'}
                >
                    <Check className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

/**
 * Loading skeleton for inbox items
 */
function InboxItemSkeleton() {
    return (
        <div className="flex items-start gap-3 p-4 border-b">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1">
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-3 w-24" />
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
