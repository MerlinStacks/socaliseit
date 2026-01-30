'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Loader2, AtSign, ExternalLink, Check, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/components/ui/toast';

/**
 * Mentions Feed Component
 * Display and manage mentions and tags
 */

export function MentionsFeed() {
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [readFilter, setReadFilter] = useState<string>('all');

    // Fetch mentions
    const { data, isLoading } = useQuery({
        queryKey: ['mentions', typeFilter, readFilter],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (typeFilter !== 'all') params.append('type', typeFilter);
            if (readFilter !== 'all') params.append('isRead', readFilter === 'read' ? 'true' : 'false');

            const res = await fetch(`/api/mentions?${params}`);
            if (!res.ok) throw new Error('Failed to fetch mentions');
            return res.json();
        }
    });

    return (
        <div className="space-y-6">
            <div className="flex gap-4 items-center flex-wrap">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="mention">Mentions (@)</SelectItem>
                        <SelectItem value="tag">Tags (Photo)</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={readFilter} onValueChange={setReadFilter}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="unread">Unread</SelectItem>
                        <SelectItem value="read">Read</SelectItem>
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
                        <AtSign className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium">No mentions found</h3>
                        <p className="text-muted-foreground">You're all caught up!</p>
                    </div>
                ) : (
                    data?.data.map((mention: any) => (
                        <MentionItem key={mention.id} mention={mention} />
                    ))
                )}
            </div>
        </div>
    );
}

function MentionItem({ mention }: { mention: any }) {
    const queryClient = useQueryClient();

    const readMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch(`/api/mentions/${mention.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ isRead: !mention.isRead }),
            });
            if (!res.ok) throw new Error('Failed to update mention');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['mentions'] });
        }
    });

    return (
        <Card className={`overflow-hidden ${mention.isRead ? 'opacity-70 bg-muted/30' : 'border-l-4 border-l-primary'}`}>
            <CardContent className="p-4">
                <div className="flex gap-4">
                    <Avatar className="h-10 w-10">
                        <AvatarImage src={mention.authorAvatar} />
                        <AvatarFallback>{mention.authorUsername[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="font-semibold">{mention.authorUsername}</span>
                                <Badge variant="outline" className="text-xs capitalize">
                                    {mention.socialAccount.platform.toLowerCase()}
                                </Badge>
                                <Badge variant="secondary" className="text-xs capitalize">
                                    {mention.type}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                    {formatDistanceToNow(new Date(mention.createdAt), { addSuffix: true })}
                                </span>
                            </div>
                        </div>

                        <p className="text-sm">{mention.text || 'Tagged you in a post'}</p>

                        {mention.mediaUrl && (
                            <div className="mt-2 text-sm text-muted-foreground flex items-center gap-2">
                                <img src={mention.mediaUrl} alt="Mention media" className="h-16 w-16 object-cover rounded-md" />
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex gap-1 justify-end">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => readMutation.mutate()}
                                title={mention.isRead ? "Mark as Unread" : "Mark as Read"}
                            >
                                {mention.isRead ? <Eye className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                            </Button>
                            {/* Link to post would go here if we had permalink stored or constructed */}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
