'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, MessageCircle, Check, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

/** Direct message data structure */
interface Message {
    id: string;
    senderName: string;
    senderAvatar?: string;
    platform: string;
    preview: string;
    isRead: boolean;
    createdAt: string;
}

/**
 * Direct Messages Inbox Component
 * Display and manage DMs from connected platforms
 */

export function DirectMessagesInbox() {
    const [platformFilter, setPlatformFilter] = useState<string>('all');
    const [readFilter, setReadFilter] = useState<string>('all');

    // Fetch messages
    const { data, isLoading } = useQuery({
        queryKey: ['messages', platformFilter, readFilter],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (platformFilter !== 'all') params.append('platform', platformFilter);
            if (readFilter !== 'all') params.append('isRead', readFilter === 'read' ? 'true' : 'false');

            const res = await fetch(`/api/messages?${params}`);
            if (!res.ok) throw new Error('Failed to fetch messages');
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
                        <SelectItem value="twitter">X (Twitter)</SelectItem>
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
                        <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium">No messages found</h3>
                        <p className="text-muted-foreground">Direct messages from connected platforms will appear here.</p>
                    </div>
                ) : (
                    data?.data.map((message: Message) => (
                        <MessageItem key={message.id} message={message} />
                    ))
                )}
            </div>
        </div>
    );
}

function MessageItem({ message }: { message: Message }) {
    const queryClient = useQueryClient();

    const readMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch(`/api/messages/${message.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ isRead: !message.isRead }),
            });
            if (!res.ok) throw new Error('Failed to update message');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['messages'] });
        }
    });

    return (
        <Card className={`overflow-hidden ${message.isRead ? 'opacity-70 bg-muted/30' : 'border-l-4 border-l-primary'}`}>
            <CardContent className="p-4">
                <div className="flex gap-4">
                    <Avatar className="h-10 w-10">
                        <AvatarImage src={message.senderAvatar} />
                        <AvatarFallback>{message.senderName?.[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="font-semibold">{message.senderName}</span>
                                <Badge variant="outline" className="text-xs capitalize">
                                    {message.platform?.toLowerCase()}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                    {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                                </span>
                            </div>
                        </div>

                        <p className="text-sm text-muted-foreground truncate">{message.preview}</p>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex gap-1 justify-end">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => readMutation.mutate()}
                                title={message.isRead ? 'Mark as Unread' : 'Mark as Read'}
                            >
                                {message.isRead ? <Eye className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
