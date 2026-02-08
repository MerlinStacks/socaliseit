/**
 * Conversation Thread View Component
 *
 * Displays a threaded conversation view for DMs and comment threads.
 * Shows message history with sender avatars, timestamps, and reply input.
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Send, Sparkles, User, RefreshCw, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { PlatformIcon } from '@/components/compose/profile-selector';
import type { Platform } from '@/lib/platform-config';
import { showErrorToast } from '@/lib/api-error';

interface Message {
    id: string;
    direction: 'inbound' | 'outbound';
    senderId: string;
    senderUsername: string;
    senderAvatar: string | null;
    text: string | null;
    mediaUrl?: string | null;
    mediaType?: string | null;
    createdAt: string;
}

interface ConversationThreadProps {
    /** Conversation ID (DM conversation or comment thread) */
    conversationId: string;
    /** Type of conversation */
    type: 'dm' | 'comment';
    /** Platform for styling and API calls */
    platform: string;
    /** Social account ID for sending replies */
    socialAccountId: string;
    /** Recipient ID for DMs */
    recipientId?: string;
    /** Callback to close/go back */
    onBack?: () => void;
    /** Account display info */
    accountInfo?: {
        name: string;
        avatar: string | null;
    };
}

/**
 * AI Reply Suggestions Component
 */
function AiReplySuggestions({
    messageText,
    messageType,
    platform,
    sentiment,
    onSelect,
    isLoading,
}: {
    messageText: string;
    messageType: 'comment' | 'mention' | 'dm';
    platform: string;
    sentiment?: string;
    onSelect: (suggestion: string) => void;
    isLoading: boolean;
}) {
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [isFetching, setIsFetching] = useState(false);

    const fetchSuggestions = async () => {
        if (!messageText || messageText.length < 3) return;

        setIsFetching(true);
        try {
            const response = await fetch('/api/ai/generate-reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messageText,
                    messageType,
                    platform,
                    sentiment: sentiment || 'neutral',
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setSuggestions(data.data?.suggestions || []);
            }
        } catch (error) {
            showErrorToast(error, 'Failed to fetch AI suggestions');
        } finally {
            setIsFetching(false);
        }
    };

    if (suggestions.length === 0 && !isFetching) {
        return (
            <div className="p-3 border-t bg-muted/30">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchSuggestions}
                    disabled={isLoading || isFetching || !messageText}
                    className="gap-2 text-muted-foreground"
                >
                    <Sparkles className="h-4 w-4" />
                    Get AI reply suggestions
                </Button>
            </div>
        );
    }

    return (
        <div className="p-3 border-t bg-muted/30 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3 w-3" />
                AI Suggestions
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 ml-auto"
                    onClick={fetchSuggestions}
                    disabled={isFetching}
                >
                    <RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} />
                </Button>
            </div>
            <div className="flex flex-wrap gap-2">
                {isFetching ? (
                    <>
                        <Skeleton className="h-8 w-32 rounded-full" />
                        <Skeleton className="h-8 w-40 rounded-full" />
                        <Skeleton className="h-8 w-28 rounded-full" />
                    </>
                ) : (
                    suggestions.map((suggestion, idx) => (
                        <button
                            key={idx}
                            onClick={() => onSelect(suggestion)}
                            className="px-3 py-1.5 text-xs rounded-full bg-background border hover:bg-accent hover:border-primary/50 transition-colors text-left max-w-[200px] truncate"
                            title={suggestion}
                        >
                            {suggestion.slice(0, 50)}{suggestion.length > 50 ? '...' : ''}
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}

/**
 * Single message bubble component
 */
function MessageBubble({
    message,
    isOutbound,
}: {
    message: Message;
    isOutbound: boolean;
}) {
    return (
        <div
            className={cn(
                'flex gap-2 mb-4',
                isOutbound && 'flex-row-reverse'
            )}
        >
            <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={message.senderAvatar || undefined} />
                <AvatarFallback>
                    {isOutbound ? <User className="h-4 w-4" /> : message.senderUsername.charAt(0).toUpperCase()}
                </AvatarFallback>
            </Avatar>

            <div className={cn('max-w-[70%]', isOutbound && 'text-right')}>
                <div className="flex items-center gap-2 mb-1">
                    <span className={cn(
                        'text-xs font-medium',
                        isOutbound && 'order-2'
                    )}>
                        {isOutbound ? 'You' : message.senderUsername}
                    </span>
                    <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                    </span>
                </div>

                <div
                    className={cn(
                        'rounded-2xl px-4 py-2 inline-block',
                        isOutbound
                            ? 'bg-primary text-primary-foreground rounded-tr-sm'
                            : 'bg-muted rounded-tl-sm'
                    )}
                >
                    {message.mediaUrl && (
                        <div className="mb-2">
                            {message.mediaType === 'image' ? (
                                <img
                                    src={message.mediaUrl}
                                    alt="Media"
                                    className="max-w-full rounded-lg max-h-48 object-cover"
                                />
                            ) : message.mediaType === 'video' ? (
                                <video
                                    src={message.mediaUrl}
                                    controls
                                    className="max-w-full rounded-lg max-h-48"
                                />
                            ) : (
                                <a
                                    href={message.mediaUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-500 underline text-sm"
                                >
                                    View attachment
                                </a>
                            )}
                        </div>
                    )}
                    {message.text && (
                        <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * Main Conversation Thread Component
 */
export default function ConversationThread({
    conversationId,
    type,
    platform,
    socialAccountId,
    recipientId,
    onBack,
    accountInfo,
}: ConversationThreadProps) {
    const queryClient = useQueryClient();
    const [replyText, setReplyText] = useState('');
    const [lastInboundMessage, setLastInboundMessage] = useState<Message | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Fetch conversation messages
    const { data, isLoading, refetch } = useQuery({
        queryKey: ['conversation', conversationId, type],
        queryFn: async () => {
            const params = new URLSearchParams({
                conversationId,
                type,
            });
            const res = await fetch(`/api/inbox/conversation?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch conversation');
            return res.json() as Promise<{ data: { messages: Message[] } }>;
        },
        staleTime: 10 * 1000,
        refetchInterval: 30 * 1000,
    });

    const messages = data?.data?.messages || [];

    // Update last inbound message for AI suggestions
    useEffect(() => {
        const inboundMessages = messages.filter(m => m.direction === 'inbound');
        if (inboundMessages.length > 0) {
            setLastInboundMessage(inboundMessages[inboundMessages.length - 1]);
        }
    }, [messages]);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Send reply mutation
    const sendReplyMutation = useMutation({
        mutationFn: async (text: string) => {
            const res = await fetch('/api/inbox/reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type,
                    conversationId,
                    socialAccountId,
                    recipientId,
                    text,
                }),
            });
            if (!res.ok) throw new Error('Failed to send reply');
            return res.json();
        },
        onSuccess: () => {
            setReplyText('');
            queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
            queryClient.invalidateQueries({ queryKey: ['inbox'] });
            toast('success', 'Reply sent!');
        },
        onError: () => {
            toast('error', 'Failed to send reply');
        },
    });

    const handleSend = () => {
        if (!replyText.trim()) return;
        sendReplyMutation.mutate(replyText);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b bg-background">
                {onBack && (
                    <Button variant="ghost" size="sm" onClick={onBack} className="p-0 h-8 w-8">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                )}

                {accountInfo && (
                    <Avatar className="h-10 w-10">
                        <AvatarImage src={accountInfo.avatar || undefined} />
                        <AvatarFallback>{accountInfo.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                )}

                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <span className="font-medium">{accountInfo?.name || 'Conversation'}</span>
                        <PlatformIcon platform={platform as Platform} size={14} />
                    </div>
                    <span className="text-xs text-muted-foreground">
                        {type === 'dm' ? 'Direct Message' : 'Comment Thread'}
                    </span>
                </div>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => refetch()}
                    disabled={isLoading}
                >
                    <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                </Button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4">
                {isLoading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-16 w-3/4" />
                        <Skeleton className="h-16 w-2/3 ml-auto" />
                        <Skeleton className="h-16 w-3/4" />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <p>No messages in this conversation</p>
                    </div>
                ) : (
                    <>
                        {messages.map((message) => (
                            <MessageBubble
                                key={message.id}
                                message={message}
                                isOutbound={message.direction === 'outbound'}
                            />
                        ))}
                        <div ref={messagesEndRef} />
                    </>
                )}
            </div>

            {/* AI Suggestions */}
            {lastInboundMessage && (
                <AiReplySuggestions
                    messageText={lastInboundMessage.text || ''}
                    messageType={type === 'dm' ? 'dm' : 'comment'}
                    platform={platform}
                    onSelect={setReplyText}
                    isLoading={sendReplyMutation.isPending}
                />
            )}

            {/* Reply Input */}
            <div className="p-4 border-t bg-background">
                <div className="flex items-end gap-2">
                    <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a reply..."
                        className="flex-1 min-h-[40px] max-h-[120px] px-3 py-2 rounded-lg border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                        rows={1}
                    />
                    <Button
                        onClick={handleSend}
                        disabled={!replyText.trim() || sendReplyMutation.isPending}
                        size="sm"
                        className="h-10 px-4"
                    >
                        <Send className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
