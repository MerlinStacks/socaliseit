/**
 * Comments Inbox Component
 * Unified view for managing social comments with platform toggle filters and read/unread state
 */

'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, MessageCircle, ThumbsUp, EyeOff, Send, MessageSquare, Check, Eye, EyeOffIcon, CheckCheck } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/components/ui/toast';
import { PlatformToggleFilter } from './platform-toggle-filter';
import type { Platform } from '@/lib/platform-config';

export function CommentsInbox() {
    const [platformFilter, setPlatformFilter] = useState<Platform[]>([]);
    const [sentimentFilter, setSentimentFilter] = useState<string>('all');
    const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
    // Default to hiding read items as per user request
    const [hideRead, setHideRead] = useState(true);
    const [page, setPage] = useState(1);
    // Bulk selection state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const queryClient = useQueryClient();

    // Fetch comments
    const { data, isLoading } = useQuery({
        queryKey: ['comments', platformFilter, sentimentFilter, readFilter, hideRead, page],
        queryFn: async () => {
            const params = new URLSearchParams({ page: page.toString() });

            // Platform filter - if specific platforms selected, send first one (API supports single)
            // For multi-platform, we'd need to extend API or filter client-side
            if (platformFilter.length === 1) {
                params.append('platform', platformFilter[0]);
            }

            if (sentimentFilter !== 'all') params.append('sentiment', sentimentFilter);

            // Read filter
            if (hideRead || readFilter === 'unread') {
                params.append('isRead', 'false');
            } else if (readFilter === 'read') {
                params.append('isRead', 'true');
            }

            const res = await fetch(`/api/comments?${params}`);
            if (!res.ok) throw new Error('Failed to fetch comments');
            return res.json();
        }
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
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['comments'] });
            setSelectedIds(new Set());
            toast('success', `Marked ${data.updated} comments as read`);
        },
        onError: () => {
            toast('error', 'Failed to update comments');
        }
    });

    // Filter client-side for multi-platform selection
    const filteredComments = data?.data?.filter((comment: any) => {
        if (platformFilter.length === 0) return true;
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
            setSelectedIds(new Set(filteredComments.map((c: any) => c.id)));
        }
    };

    const allSelected = filteredComments.length > 0 && selectedIds.size === filteredComments.length;

    return (
        <div className="space-y-6">
            {/* Filters Row */}
            <div className="flex gap-4 items-center flex-wrap">
                {/* Platform Toggle Buttons */}
                <PlatformToggleFilter
                    selected={platformFilter}
                    onChange={setPlatformFilter}
                />

                {/* Sentiment Filter */}
                <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
                    <SelectTrigger className="w-[140px]">
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

                {/* Read Filter */}
                <Select value={readFilter} onValueChange={(v) => setReadFilter(v as 'all' | 'unread' | 'read')}>
                    <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="unread">Unread</SelectItem>
                        <SelectItem value="read">Read</SelectItem>
                    </SelectContent>
                </Select>

                {/* Hide Read Toggle */}
                <Button
                    variant={hideRead ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setHideRead(!hideRead)}
                    className="gap-2"
                >
                    <EyeOffIcon className="h-4 w-4" />
                    Hide Read
                </Button>

                {/* Bulk Actions */}
                <div className="flex gap-2 ml-auto">
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

            {/* Select All Row */}
            {filteredComments.length > 0 && (
                <div className="flex items-center gap-2 px-2">
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
            <div className="space-y-4">
                {isLoading ? (
                    <div className="flex justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : filteredComments.length === 0 ? (
                    <div className="text-center p-12 bg-muted/20 rounded-lg">
                        <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium">No comments found</h3>
                        <p className="text-muted-foreground">Adjust your filters or sync new comments.</p>
                    </div>
                ) : (
                    filteredComments.map((comment: any) => (
                        <CommentItem
                            key={comment.id}
                            comment={comment}
                            isSelected={selectedIds.has(comment.id)}
                            onToggleSelect={() => toggleSelection(comment.id)}
                        />
                    ))
                )}
            </div>

            {/* Pagination Controls could go here */}
        </div>
    );
}

interface CommentItemProps {
    comment: any;
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
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['comments'] });
        }
    });

    return (
        <Card className={`overflow-hidden transition-all ${comment.isHidden
            ? 'opacity-60 bg-muted/30'
            : comment.isRead
                ? 'opacity-80 bg-muted/10'
                : 'border-l-4 border-l-primary'
            }`}>
            <CardContent className="p-4">
                <div className="flex gap-4">
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
                        <AvatarImage src={comment.authorAvatar} />
                        <AvatarFallback>{comment.authorUsername[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold">{comment.authorUsername}</span>
                                <Badge variant="outline" className="text-xs capitalize">
                                    {comment.socialAccount.platform.toLowerCase()}
                                </Badge>
                                {comment.isHidden && <Badge variant="destructive" className="text-xs">Hidden</Badge>}
                                {!comment.isRead && <Badge variant="default" className="text-xs bg-primary">New</Badge>}
                                <span className="text-xs text-muted-foreground">
                                    {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                                </span>
                            </div>
                        </div>

                        <p className="text-sm">{comment.text}</p>

                        <div className="flex items-center gap-4 pt-2 text-xs text-muted-foreground">
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
                            {/* Mark Read/Unread */}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => readMutation.mutate()}
                                title={comment.isRead ? 'Mark as Unread' : 'Mark as Read'}
                            >
                                {comment.isRead ? <Eye className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                            </Button>
                            {/* Hide/Unhide */}
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => hideMutation.mutate()}>
                                <EyeOff className="h-4 w-4" />
                            </Button>
                            {/* Reply */}
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsReplying(!isReplying)}>
                                <MessageCircle className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                {isReplying && (
                    <div className="mt-4 pl-14 space-y-2">
                        <Textarea
                            placeholder="Write a reply..."
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            className="text-sm"
                            rows={2}
                        />
                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" size="sm" onClick={() => setIsReplying(false)}>Cancel</Button>
                            <Button size="sm" onClick={() => replyMutation.mutate()} disabled={!replyText || replyMutation.isPending}>
                                {replyMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Send className="h-3 w-3 mr-2" />}
                                Reply
                            </Button>
                        </div>
                    </div>
                )}

                {/* Render replies if loaded */}
                {comment.replies && comment.replies.length > 0 && (
                    <div className="mt-4 pl-14 space-y-4 border-l-2 ml-4">
                        {comment.replies.map((reply: any) => (
                            <div key={reply.id} className="flex gap-3">
                                <Avatar className="h-8 w-8">
                                    <AvatarImage src={reply.authorAvatar} />
                                    <AvatarFallback>{reply.authorUsername[0]}</AvatarFallback>
                                </Avatar>
                                <div className="bg-muted p-3 rounded-lg text-sm flex-1">
                                    <span className="font-semibold block">{reply.authorUsername}</span>
                                    {reply.text}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
