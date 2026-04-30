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
import { Send, Sparkles, User, RefreshCw, ArrowLeft, ExternalLink, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { broadcastSync } from '@/lib/cross-tab-sync';
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
    /** Nesting depth (0 = root, 1+ = reply) — provided by threaded API */
    depth?: number;
    /** Who this message is replying to — for quoted context */
    parentAuthor?: string | null;
    /** Nested reply messages (threaded tree structure) */
    replies?: Message[];
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
            <div className="p-3 border-t" style={{ background: 'var(--bg-tertiary)' }}>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchSuggestions}
                    disabled={isLoading || isFetching || !messageText}
                    className="gap-2"
                    style={{ color: 'var(--accent-gold)' }}
                >
                    <Sparkles className="h-4 w-4" />
                    Get AI reply suggestions
                </Button>
            </div>
        );
    }

    return (
        <div className="p-3 border-t space-y-2" style={{ background: 'var(--bg-tertiary)' }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--accent-gold)' }}>
                <Sparkles className="h-3 w-3" />
                <span className="font-medium">AI Suggestions</span>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 ml-auto interactive-scale"
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
                            className="px-3 py-1.5 text-xs rounded-full border transition-all duration-200 text-left max-w-[200px] truncate hover:shadow-sm"
                            style={{
                                background: 'var(--bg-secondary)',
                                borderColor: 'var(--border)',
                                color: 'var(--text-primary)',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-gold)'}
                            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
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
 * Single message bubble component — with optional quoted-reply context
 */
function MessageBubble({
    message,
    isOutbound,
    showAvatar = true,
    showHeader = true,
}: {
    message: Message;
    isOutbound: boolean;
    /** Hide avatar for grouped consecutive messages from the same sender */
    showAvatar?: boolean;
    /** Hide username/timestamp header for grouped messages */
    showHeader?: boolean;
}) {
    const depth = message.depth ?? 0;
    const indentPx = Math.min(depth, 3) * 16;

    return (
        <div
            className={cn(
                'flex gap-2 animate-slide-up',
                isOutbound && 'flex-row-reverse',
                showHeader ? 'mb-4' : 'mb-1'
            )}
            style={{ paddingLeft: isOutbound ? 0 : `${indentPx}px` }}
        >
            {showAvatar ? (
                <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={message.senderAvatar || undefined} />
                    <AvatarFallback colorSeed={isOutbound ? undefined : message.senderUsername}>
                        {isOutbound ? <User className="h-4 w-4" /> : message.senderUsername.charAt(0).toUpperCase()}
                    </AvatarFallback>
                </Avatar>
            ) : (
                <div className="w-8 shrink-0" />
            )}

            <div className={cn('max-w-[70%]', isOutbound && 'text-right')}>
                {showHeader && (
                    <div className="flex items-center gap-2 mb-1">
                        <span className={cn(
                            'text-xs font-medium',
                            isOutbound && 'order-2'
                        )}>
                            {isOutbound ? 'You' : message.senderUsername}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                        </span>
                    </div>
                )}

                {/* Quoted reply context — show who this message is replying to */}
                {message.parentAuthor && (
                    <div
                        className="text-[10px] px-3 py-1 mb-1 rounded-t-lg border-l-2 inline-block"
                        style={{
                            color: 'var(--text-muted)',
                            borderLeftColor: 'var(--accent-gold)',
                            background: 'var(--bg-tertiary)',
                        }}
                    >
                        replying to <span style={{ color: 'var(--accent-gold)' }}>@{message.parentAuthor}</span>
                    </div>
                )}

                <div
                    className={cn(
                        'rounded-2xl px-4 py-2 inline-block shadow-sm',
                        isOutbound
                            ? 'bg-gradient text-white rounded-tr-sm'
                            : 'glass-card rounded-tl-sm',
                        message.parentAuthor && 'rounded-tl-none'
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
                                    className="text-sm underline"
                                    style={{ color: 'var(--info)' }}
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
            return res.json() as Promise<{
                data: {
                    messages: Message[];
                    /** Why: Original post context returned for comment threads */
                    postContext?: {
                        caption: string | null;
                        thumbnailUrl: string | null;
                        permalink: string | null;
                    } | null;
                    /** Thread metadata for comment threads */
                    threadInfo?: {
                        totalReplies: number;
                        participants: Array<{ username: string; avatar: string | null }>;
                    };
                };
            }>;
        },
        staleTime: 10 * 1000,
        refetchInterval: 10 * 1000,
        refetchIntervalInBackground: false,
    });

    // Flatten threaded messages for display in the linear conversation view
    const flattenMessages = (msgs: Message[]): Message[] => {
        const result: Message[] = [];
        for (const msg of msgs) {
            result.push(msg);
            if (msg.replies && msg.replies.length > 0) {
                result.push(...flattenMessages(msg.replies));
            }
        }
        return result;
    };

    const messages = flattenMessages(data?.data?.messages || []);
    const postContext = data?.data?.postContext || null;

    /**
     * Render messages with same-sender grouping.
     * Consecutive messages from the same sender hide redundant avatars/headers.
     */
    const renderGroupedMessages = (msgs: Message[]) => {
        return msgs.map((message, index) => {
            const prevMsg = index > 0 ? msgs[index - 1] : null;
            const isSameSender = prevMsg?.senderId === message.senderId && prevMsg?.direction === message.direction;

            return (
                <MessageBubble
                    key={message.id}
                    message={message}
                    isOutbound={message.direction === 'outbound'}
                    showAvatar={!isSameSender}
                    showHeader={!isSameSender}
                />
            );
        });
    };

    // Update last inbound message for AI suggestions
    useEffect(() => {
        const inboundMessages = messages.filter(m => m.direction === 'inbound');
        if (inboundMessages.length > 0) {
            setLastInboundMessage(inboundMessages[inboundMessages.length - 1]);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

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
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({})) as { error?: string; data?: { status?: string } };
                const err = Object.assign(new Error(errorData.error || 'Failed to send reply'), {
                    code: errorData.data?.status,
                });
                throw err;
            }
            return res.json();
        },
        onMutate: async (text: string) => {
            // Cancel any in-flight refetches so they don't overwrite the optimistic message
            await queryClient.cancelQueries({ queryKey: ['conversation', conversationId] });
            const snapshot = queryClient.getQueryData(['conversation', conversationId]);

            // Append the outbound message immediately so the user sees it right away
            const optimisticMessage: Message = {
                id: `optimistic-${Date.now()}`,
                direction: 'outbound',
                senderId: socialAccountId,
                senderUsername: 'You',
                senderAvatar: null,
                text,
                createdAt: new Date().toISOString(),
            };
            queryClient.setQueryData(['conversation', conversationId, type], (old: { data?: { messages?: Message[] } } | undefined) => {
                if (!old?.data?.messages) return old;
                return { ...old, data: { ...old.data, messages: [...old.data.messages, optimisticMessage] } };
            });
            setReplyText('');
            return { snapshot };
        },
        onError: (_err, text, ctx) => {
            // Restore previous conversation state and put the text back so the user can retry
            if (ctx?.snapshot) {
                queryClient.setQueryData(['conversation', conversationId, type], ctx.snapshot);
            }
            setReplyText(text);
            const err = _err as Error & { code?: string };
            if (err.code === 'not_implemented') {
                toast('error', 'Comment replies aren\'t supported for this platform yet');
            } else {
                toast('error', 'Failed to send reply');
            }
        },
        onSuccess: (data) => {
            if (!data?.success) {
                // Backend returned 200 but flagged the operation as failed (e.g. not_implemented)
                queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
                toast('error', data?.error || 'Failed to send reply');
                return;
            }
            // Replace optimistic message with real data from the server
            queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
            queryClient.invalidateQueries({ queryKey: ['inbox'] });
            queryClient.invalidateQueries({ queryKey: ['unread-counts'] });
            broadcastSync('inbox:updated');
            toast('success', 'Reply sent!');
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
            <div className="flex items-center gap-2 md:gap-3 p-3 md:p-4 border-b glass sticky top-0 z-10" style={{ borderBottomColor: 'var(--accent-gold)', borderBottomWidth: '2px' }}>
                {onBack && (
                    <Button variant="ghost" size="sm" onClick={onBack} className="p-0 h-8 w-8 interactive-scale">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                )}

                {accountInfo && (
                    <Avatar className="h-10 w-10 ring-2" style={{ '--tw-ring-color': 'var(--accent-gold)' } as React.CSSProperties}>
                        <AvatarImage src={accountInfo.avatar || undefined} />
                        <AvatarFallback colorSeed={accountInfo.name}>{accountInfo.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                )}

                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold">{accountInfo?.name || 'Conversation'}</span>
                        <PlatformIcon platform={platform as Platform} size={14} />
                    </div>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {type === 'dm' ? 'Direct Message' : 'Comment Thread'}
                    </span>
                </div>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => refetch()}
                    disabled={isLoading}
                    className="interactive-scale"
                >
                    <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                </Button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 md:p-4">
                {/* Why: Show original post context above comment threads so agents
                    know what post the conversation is about without leaving the inbox */}
                {postContext && type === 'comment' && (
                    <div className="mb-4 p-3 rounded-lg border flex items-start gap-3 glass-card">
                        {postContext.thumbnailUrl && (
                            <img
                                src={postContext.thumbnailUrl}
                                alt="Original post"
                                className="w-14 h-14 rounded-md object-cover shrink-0"
                            />
                        )}
                        {!postContext.thumbnailUrl && (
                            <div className="w-14 h-14 rounded-md flex items-center justify-center shrink-0" style={{ background: 'var(--bg-tertiary)' }}>
                                <ImageIcon className="h-6 w-6" style={{ color: 'var(--text-muted)' }} />
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--accent-gold)' }}>Original Post</span>
                            {postContext.caption && (
                                <p className="text-xs line-clamp-2 mt-0.5" style={{ color: 'var(--text-secondary)' }}>{postContext.caption}</p>
                            )}
                            {postContext.permalink && (
                                <a
                                    href={postContext.permalink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] mt-1 hover:underline"
                                    style={{ color: 'var(--info)' }}
                                >
                                    View on platform <ExternalLink className="h-3 w-3" />
                                </a>
                            )}
                        </div>
                    </div>
                )}
                {isLoading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-16 w-3/4" />
                        <Skeleton className="h-16 w-2/3 ml-auto" />
                        <Skeleton className="h-16 w-3/4" />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2">
                        <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>No messages in this conversation</p>
                    </div>
                ) : (
                    <>
                        {renderGroupedMessages(messages)}
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

            {/* Thread info — show participant count and reply total */}
            {data?.data?.threadInfo && type === 'comment' && (
                <div className="flex items-center gap-3 px-4 py-2 border-t text-xs" style={{ color: 'var(--text-muted)', background: 'var(--bg-tertiary)' }}>
                    <span>{data.data.threadInfo.totalReplies} {data.data.threadInfo.totalReplies === 1 ? 'reply' : 'replies'}</span>
                    <span>·</span>
                    <span>{data.data.threadInfo.participants.length} {data.data.threadInfo.participants.length === 1 ? 'participant' : 'participants'}</span>
                </div>
            )}

            {/* Reply Input */}
            <div
                className="p-3 md:p-4 border-t glass"
                style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 12px), 12px)' }}
            >
                <div className="flex items-end gap-2">
                    <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a reply..."
                        className="flex-1 min-h-[40px] max-h-[120px] px-3 py-2 rounded-lg border resize-none focus:outline-none focus:ring-2 text-sm"
                        style={{
                            background: 'var(--bg-secondary)',
                            borderColor: 'var(--border)',
                            // @ts-expect-error CSS custom property
                            '--tw-ring-color': 'var(--accent-gold)',
                        }}
                        rows={1}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!replyText.trim() || sendReplyMutation.isPending}
                        className="h-10 px-4 rounded-lg bg-gradient text-white font-medium transition-all duration-200 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed btn-interactive flex items-center justify-center"
                    >
                        <Send className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
