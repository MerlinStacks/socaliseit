'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';
import { Loader2, MessageCircle, MoreVertical, ThumbsUp, Trash2, EyeOff, Send, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/components/ui/toast';

/**
 * Comments Inbox Component
 * Unified view for managing social comments
 */

export function CommentsInbox() {
    const [platformFilter, setPlatformFilter] = useState<string>('all');
    const [sentimentFilter, setSentimentFilter] = useState<string>('all');
    const [page, setPage] = useState(1);

    // Fetch comments
    const { data, isLoading } = useQuery({
        queryKey: ['comments', platformFilter, sentimentFilter, page],
        queryFn: async () => {
            const params = new URLSearchParams({ page: page.toString() });
            if (platformFilter !== 'all') params.append('platform', platformFilter);
            if (sentimentFilter !== 'all') params.append('sentiment', sentimentFilter);

            const res = await fetch(`/api/comments?${params}`);
            if (!res.ok) throw new Error('Failed to fetch comments');
            return res.json();
        }
    });

    return (
        <div className="space-y-6">
            <div className="flex gap-4 items-center flex-wrap">
                <Select value={platformFilter} onValueChange={setPlatformFilter}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="All Platforms" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Platforms</SelectItem>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="facebook">Facebook</SelectItem>
                        <SelectItem value="tiktok">TikTok</SelectItem>
                        <SelectItem value="youtube">YouTube</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="All Sentiments" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Sentiments</SelectItem>
                        <SelectItem value="positive">Positive</SelectItem>
                        <SelectItem value="neutral">Neutral</SelectItem>
                        <SelectItem value="negative">Negative</SelectItem>
                        <SelectItem value="question">Question</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-4">
                {isLoading ? (
                    <div className="flex justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : data?.data?.length === 0 ? (
                    <div className="text-center p-12 bg-muted/20 rounded-lg">
                        <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium">No comments found</h3>
                        <p className="text-muted-foreground">Adjust your filters or sync new comments.</p>
                    </div>
                ) : (
                    data?.data.map((comment: any) => (
                        <CommentItem key={comment.id} comment={comment} />
                    ))
                )}
            </div>

            {/* Pagination Controls could go here */}
        </div>
    );
}

function CommentItem({ comment }: { comment: any }) {
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

    return (
        <Card className={`overflow-hidden ${comment.isHidden ? 'opacity-60 bg-muted/30' : ''}`}>
            <CardContent className="p-4">
                <div className="flex gap-4">
                    <Avatar className="h-10 w-10">
                        <AvatarImage src={comment.authorAvatar} />
                        <AvatarFallback>{comment.authorUsername[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="font-semibold">{comment.authorUsername}</span>
                                <Badge variant="outline" className="text-xs capitalize">
                                    {comment.socialAccount.platform.toLowerCase()}
                                </Badge>
                                {comment.isHidden && <Badge variant="destructive" className="text-xs">Hidden</Badge>}
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
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => hideMutation.mutate()}>
                                <EyeOff className="h-4 w-4" />
                            </Button>
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
