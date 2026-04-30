'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, MessageCircle, Check, Eye } from 'lucide-react';
import { PlatformIcon } from '@/components/compose/profile-selector';
import { cn } from '@/lib/utils';
import type { Platform } from '@/lib/platform-config';
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
        },
        staleTime: 30 * 1000, // 30 seconds
        refetchInterval: 60 * 1000, // Auto-refresh every minute
        refetchIntervalInBackground: false,
    });

    return (
        <div className="space-y-6">
            <div className="flex gap-2 items-center overflow-hidden">
                <Select value={platformFilter} onValueChange={setPlatformFilter}>
                    <SelectTrigger className="w-[140px] md:w-[180px] text-xs md:text-sm">
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
                    <SelectTrigger className="w-[120px] md:w-[180px] text-xs md:text-sm">
                        <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="unread">Unread</SelectItem>
                        <SelectItem value="read">Read</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2 md:space-y-4">
                {isLoading ? (
                    <div className="flex justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : data?.data?.length === 0 ? (
                    <div className="text-center p-6 md:p-12 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
                        <div className="rounded-full p-4 mx-auto w-fit mb-4" style={{ background: 'var(--success-light)' }}>
                            <MessageCircle className="h-10 w-10" style={{ color: 'var(--success)', opacity: 0.7 }} />
                        </div>
                        <h3 className="text-lg font-medium">No messages found</h3>
                        <p style={{ color: 'var(--text-muted)' }}>Direct messages from connected platforms will appear here.</p>
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
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isRead: !message.isRead }),
            });
            if (!res.ok) throw new Error('Failed to update message');
        },
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey: ['messages'] });
            const snapshot = queryClient.getQueriesData({ queryKey: ['messages'] });
            queryClient.setQueriesData({ queryKey: ['messages'] }, (old: unknown) => {
                const prev = old as { data: Message[] } | undefined;
                if (!prev?.data) return old;
                return { ...prev, data: prev.data.map((m) => m.id === message.id ? { ...m, isRead: !message.isRead } : m) };
            });
            return { snapshot };
        },
        onError: (_err: unknown, _vars: unknown, ctx: unknown) => {
            const context = ctx as { snapshot: Array<[readonly unknown[], unknown]> } | undefined;
            context?.snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data));
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['messages'] });
            queryClient.invalidateQueries({ queryKey: ['unread-counts'] });
        },
    });

    return (
        <div
            className={cn(
                'glass-card overflow-hidden transition-all duration-200',
                !message.isRead && 'border-l-[3px]'
            )}
            style={{
                borderLeftColor: !message.isRead ? 'var(--accent-pink)' : undefined,
            }}
        >
            <div className="p-2.5 md:p-4">
                <div className="flex gap-2.5 md:gap-4">
                    <Avatar className="h-8 w-8 md:h-10 md:w-10 shrink-0">
                        <AvatarImage src={message.senderAvatar} />
                        <AvatarFallback colorSeed={message.senderName || undefined}>{message.senderName?.[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-semibold text-sm truncate">{message.senderName}</span>
                                <PlatformIcon platform={message.platform?.toLowerCase() as Platform} size={14} />
                            </div>
                            <span className="text-[11px] whitespace-nowrap shrink-0" style={{ color: 'var(--text-muted)' }}>
                                {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                            </span>
                        </div>

                        <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{message.preview}</p>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex gap-1 justify-end">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 interactive-scale"
                                onClick={() => readMutation.mutate(undefined)}
                                title={message.isRead ? 'Mark as Unread' : 'Mark as Read'}
                            >
                                {message.isRead ? <Eye className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
