'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, ExternalLink, MessageCircle, Play, Plus, RefreshCw, Sparkles, Trash2, Video, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Recommendation = {
    id: string;
    title: string;
    advice: string;
    rationale?: string | null;
    category: string;
    priority: string;
    status: 'NEW' | 'IN_PROGRESS' | 'DONE' | 'DISMISSED';
    platform?: string | null;
    confidence: number;
    impactResult?: Record<string, unknown> | null;
};

type Experiment = {
    id: string;
    title: string;
    hypothesis: string;
    platform?: string | null;
    metric: string;
    status: 'PLANNED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED';
};

type Report = {
    id: string;
    title: string;
    summary: string;
    overallScore?: number | null;
    confidence: number;
    status: 'GENERATING' | 'COMPLETED' | 'FAILED';
    trigger: string;
    createdAt: string;
    recommendations: Recommendation[];
    experiments?: Experiment[];
};

type MediaAttachment = {
    id: string;
    postId?: string;
    title: string;
    caption?: string;
    platform?: string | null;
    status?: string;
    type: 'image' | 'video';
    mimeType: string;
    url: string;
    previewUrl: string;
    width?: number | null;
    height?: number | null;
    duration?: number | null;
    rationale: string;
};

type ChatItem = { role: 'user' | 'assistant'; content: string; attachments?: MediaAttachment[] };

type SebChatSession = {
    id: string;
    title: string;
    updatedAt: string;
    messages: Array<{ role: 'USER' | 'ASSISTANT'; content: string; metadata?: { attachments?: MediaAttachment[] } | null }>;
};

type Thread = {
    id: string;
    title: string;
    subtitle: string;
    status?: string;
    prompt?: string;
};

type SebChatResponse = {
    session: { id: string };
    message: { content: string; metadata?: { attachments?: MediaAttachment[] } | null };
};

function confidenceLabel(confidence: number) {
    if (confidence >= 0.75) return 'High confidence';
    if (confidence >= 0.45) return 'Medium confidence';
    return 'Low confidence';
}

function formatDate(value?: string) {
    if (!value) return 'Not yet';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function cleanSebMessage(content: string) {
    const tidy = (value: string) => value
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/<[^>]+>/g, '')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    try {
        const parsed = JSON.parse(content) as unknown;
        if (typeof parsed === 'string') {
            return cleanSebMessage(parsed);
        }
        if (parsed && typeof parsed === 'object' && 'message' in parsed && typeof parsed.message === 'string') {
            return tidy(parsed.message);
        }
        if (parsed && typeof parsed === 'object' && 'response' in parsed && typeof parsed.response === 'string') {
            return tidy(parsed.response);
        }
        if (parsed && typeof parsed === 'object' && 'content' in parsed && typeof parsed.content === 'string') {
            return tidy(parsed.content);
        }
    } catch {
        const looseMatch = content.trim().match(/^[{\s]*["'](?:message|response|content)["']\s*:\s*"([\s\S]*)"\s*}?\s*$/);
        if (looseMatch) {
            try {
                return tidy(JSON.parse(`"${looseMatch[1]}"`) as string);
            } catch {
                return tidy(looseMatch[1]);
            }
        }

        return tidy(content);
    }
    return tidy(content);
}

function formatDuration(seconds?: number | null) {
    if (!seconds) return null;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

function sessionMessages(session?: SebChatSession): ChatItem[] {
    return (session?.messages || []).map((message) => ({
        role: message.role === 'USER' ? 'user' : 'assistant',
        content: cleanSebMessage(message.content),
        attachments: message.metadata?.attachments || [],
    }));
}

export default function SebClient() {
    const queryClient = useQueryClient();
    const [chatMessage, setChatMessage] = useState('');
    const [localChats, setLocalChats] = useState<Record<string, ChatItem[]>>({});
    const [pendingThreads, setPendingThreads] = useState<string[]>([]);
    const [selectedThreadId, setSelectedThreadId] = useState('new');
    const [activeSubTab, setActiveSubTab] = useState<'chat' | 'recommendations'>('chat');
    const [preview, setPreview] = useState<MediaAttachment | null>(null);

    const reportsQuery = useQuery({
        queryKey: ['seb-report'],
        queryFn: async () => {
            const res = await fetch('/api/seb/report');
            if (!res.ok) throw new Error('Failed to load Seb report');
            return res.json() as Promise<{ latest: Report | null; history: Report[] }>;
        },
        staleTime: 60_000,
        refetchInterval: (query) => query.state.data?.latest?.status === 'GENERATING' ? 5000 : false,
    });

    const chatSessionsQuery = useQuery({
        queryKey: ['seb-chat-sessions'],
        queryFn: async () => {
            const res = await fetch('/api/seb/chat/sessions');
            if (!res.ok) throw new Error('Failed to load Seb chats');
            return res.json() as Promise<{ sessions: SebChatSession[] }>;
        },
        staleTime: 30_000,
    });

    const generateMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/seb/report/generate', { method: 'POST' });
            if (!res.ok) throw new Error((await res.json()).error || 'Failed to generate report');
            return res.json();
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['seb-report'] }),
    });

    const updateExperimentMutation = useMutation({
        mutationFn: async ({ id, status }: { id: string; status: Experiment['status'] }) => {
            const res = await fetch(`/api/seb/experiments/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            if (!res.ok) throw new Error('Failed to update experiment');
            return res.json();
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['seb-report'] }),
    });

    const updateRecommendationMutation = useMutation({
        mutationFn: async ({ id, status }: { id: string; status: Recommendation['status'] }) => {
            const res = await fetch(`/api/seb/recommendations/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            if (!res.ok) throw new Error('Failed to update recommendation');
            return res.json();
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['seb-report'] }),
    });

    const deleteChatMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/seb/chat/sessions/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete chat');
            return res.json();
        },
        onSuccess: (_data, id) => {
            if (selectedThreadId === `chat:${id}`) startNewChat();
            setLocalChats(({ [`chat:${id}`]: _deleted, ...chats }) => chats);
            setPendingThreads((items) => items.filter((threadId) => threadId !== `chat:${id}`));
            queryClient.invalidateQueries({ queryKey: ['seb-chat-sessions'] });
        },
    });

    const deleteReportMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/seb/report/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete report');
            return res.json();
        },
        onSuccess: (_data, id) => {
            if (selectedThreadId === `report:${id}`) startNewChat();
            queryClient.invalidateQueries({ queryKey: ['seb-report'] });
        },
    });

    const latest = reportsQuery.data?.latest;
    const recommendations = latest?.recommendations || [];
    const experiments = latest?.experiments || [];
    const inProgressCount = recommendations.filter((item) => item.status === 'IN_PROGRESS').length + experiments.filter((item) => item.status === 'RUNNING').length;
    const chatSessions = chatSessionsQuery.data?.sessions || [];
    const threads: Thread[] = [
        {
            id: 'new',
            title: 'New chat with Seb',
            subtitle: 'Ask about captions, timing, creative, competitors, or next actions.',
        },
        ...chatSessions.map((session) => ({
            id: `chat:${session.id}`,
            title: session.title,
            subtitle: session.messages.at(-1)?.content ? cleanSebMessage(session.messages.at(-1)?.content || '') : formatDate(session.updatedAt),
            status: 'Chat',
        })),
        ...recommendations.map((item) => ({
            id: `recommendation:${item.id}`,
            title: item.title,
            subtitle: `${item.category.replaceAll('_', ' ')}${item.platform ? ` · ${item.platform}` : ''}`,
            status: item.status.replaceAll('_', ' '),
            prompt: `I want to discuss this Seb recommendation. Title: ${item.title}. Advice: ${item.advice}${item.rationale ? ` Rationale: ${item.rationale}` : ''}`,
        })),
        ...experiments.map((item) => ({
            id: `experiment:${item.id}`,
            title: item.title,
            subtitle: `${item.metric}${item.platform ? ` · ${item.platform}` : ''}`,
            status: item.status,
            prompt: `I want to discuss this Seb experiment. Title: ${item.title}. Hypothesis: ${item.hypothesis}. Metric: ${item.metric}.`,
        })),
        ...(reportsQuery.data?.history || []).map((report) => ({
            id: `report:${report.id}`,
            title: report.title,
            subtitle: formatDate(report.createdAt),
            status: report.overallScore == null ? undefined : `${Math.round(report.overallScore)} score`,
            prompt: `I want to discuss this Seb report. Title: ${report.title}. Summary: ${report.summary}`,
        })),
    ];
    const selectedThread = threads.find((thread) => thread.id === selectedThreadId) || (localChats[selectedThreadId]
        ? { id: selectedThreadId, title: 'Seb chat', subtitle: 'Chat response is ready.', status: selectedThreadId.startsWith('chat:') ? 'Chat' : undefined }
        : threads[0]);
    const selectedChatSession = selectedThread.id.startsWith('chat:')
        ? chatSessions.find((session) => session.id === selectedThread.id.replace('chat:', ''))
        : undefined;
    const chat = localChats[selectedThread.id] || sessionMessages(selectedChatSession);
    const isSelectedThreadPending = pendingThreads.includes(selectedThread.id);

    const sendChat = async () => {
        const message = chatMessage.trim();
        if (!message || pendingThreads.includes(selectedThread.id)) return;

        const requestThreadId = selectedThread.id;
        const requestSessionId = selectedThread.id.startsWith('chat:') ? selectedThread.id.replace('chat:', '') : undefined;
        const requestMessage = selectedThread.prompt ? `${selectedThread.prompt}\n\nUser question: ${message}` : message;
        const optimisticChat: ChatItem[] = [...chat, { role: 'user', content: message }];

        setLocalChats((chats) => ({
            ...chats,
            [requestThreadId]: optimisticChat,
        }));
        setPendingThreads((items) => [...items, requestThreadId]);
        setChatMessage('');

        try {
            const res = await fetch('/api/seb/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: requestSessionId, message: requestMessage }),
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Seb chat failed');

            const data = await res.json() as SebChatResponse;
            const nextThreadId = `chat:${data.session.id}`;
            const assistantMessage: ChatItem = {
                role: 'assistant',
                content: cleanSebMessage(data.message.content),
                attachments: data.message.metadata?.attachments || [],
            };

            setLocalChats((chats) => {
                const items = [...(chats[requestThreadId] || optimisticChat), assistantMessage];
                if (requestThreadId === nextThreadId) {
                    return { ...chats, [nextThreadId]: items };
                }

                const { [requestThreadId]: _oldThread, ...rest } = chats;
                return { ...rest, [nextThreadId]: items };
            });
            setSelectedThreadId((current) => current === requestThreadId ? nextThreadId : current);
            queryClient.invalidateQueries({ queryKey: ['seb-chat-sessions'] });
        } catch (error) {
            setLocalChats((chats) => ({
                ...chats,
                [requestThreadId]: [
                    ...(chats[requestThreadId] || optimisticChat),
                    { role: 'assistant', content: error instanceof Error ? error.message : 'Seb chat failed' },
                ],
            }));
        } finally {
            setPendingThreads((items) => items.filter((threadId) => threadId !== requestThreadId));
        }
    };

    const startNewChat = () => {
        setSelectedThreadId('new');
        setActiveSubTab('chat');
        setChatMessage('');
    };

    const openThread = (thread: Thread) => {
        if (thread.id === 'new') {
            startNewChat();
            return;
        }

        setSelectedThreadId(thread.id);
        setActiveSubTab('chat');
        setChatMessage('');
    };

    const openRecommendationChat = (id: string) => {
        setSelectedThreadId(id);
        setActiveSubTab('chat');
    };

    return (
        <div className="min-h-screen bg-[var(--bg-secondary)] p-2 md:p-4">
            <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2 text-xs font-medium text-[var(--accent-gold)]">
                        <Sparkles className="h-4 w-4" />
                        Proactive AI social coach
                    </div>
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Seb</h1>
                        <p className="max-w-3xl text-xs text-[var(--text-secondary)] md:text-sm">
                            Evidence-backed chat for recommendations, in-progress tasks, captions, creative, video, competitors, and connected platforms.
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => generateMutation.mutate()}
                    disabled={generateMutation.isPending}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-gold)] px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:opacity-90 disabled:opacity-60"
                >
                    <RefreshCw className={cn('h-4 w-4', generateMutation.isPending && 'animate-spin')} />
                    {generateMutation.isPending ? 'Queued...' : 'Regenerate Advice'}
                </button>
            </div>

            {reportsQuery.isLoading ? (
                <div className="glass-card p-8 text-[var(--text-secondary)]">Loading Seb...</div>
            ) : (
                <div className="grid min-h-[calc(100vh-7.5rem)] overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-xl lg:grid-cols-[22rem_1fr]">
                    <aside className="border-b border-[var(--border)] bg-[var(--bg-secondary)]/80 p-3 lg:border-b-0 lg:border-r">
                        <button
                            type="button"
                            onClick={startNewChat}
                            className="mb-3 flex w-full items-center gap-3 rounded-2xl bg-[var(--accent-gold)] px-4 py-3 text-left text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
                        >
                            <Plus className="h-4 w-4" />
                            New chat
                        </button>

                        <div className="mb-4 grid grid-cols-2 gap-2">
                            <MiniMetric label="Recommendations" value={recommendations.length.toString()} />
                            <MiniMetric label="In progress" value={inProgressCount.toString()} />
                        </div>

                        <div className="max-h-[calc(100vh-20rem)] space-y-2 overflow-y-auto pr-1">
                            {threads.map((thread) => {
                                const chatId = thread.id.startsWith('chat:') ? thread.id.replace('chat:', '') : null;
                                const reportId = thread.id.startsWith('report:') ? thread.id.replace('report:', '') : null;
                                return (
                                <div
                                    key={thread.id}
                                    className={cn(
                                        'group flex w-full items-start gap-2 rounded-2xl border p-3 text-left transition',
                                        selectedThread.id === thread.id
                                            ? 'border-[var(--accent-gold)] bg-[var(--accent-gold-light)]'
                                            : 'border-transparent bg-[var(--bg-primary)] hover:border-[var(--border)]'
                                    )}
                                >
                                    <button type="button" onClick={() => openThread(thread)} className="min-w-0 flex-1 text-left">
                                        <div className="flex items-start justify-between gap-3">
                                            <p className="line-clamp-2 text-sm font-semibold text-[var(--text-primary)]">{thread.title}</p>
                                            {thread.status && <span className="shrink-0 rounded-full bg-[var(--bg-tertiary)] px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">{thread.status}</span>}
                                        </div>
                                        <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{thread.subtitle}</p>
                                    </button>
                                    {chatId && (
                                        <button
                                            type="button"
                                            onClick={() => deleteChatMutation.mutate(chatId)}
                                            disabled={deleteChatMutation.isPending}
                                            aria-label="Delete chat"
                                            className="rounded-lg p-1.5 text-[var(--text-muted)] opacity-100 transition hover:bg-red-500/10 hover:text-red-600 lg:opacity-0 lg:group-hover:opacity-100"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}
                                    {reportId && (
                                        <button
                                            type="button"
                                            onClick={() => deleteReportMutation.mutate(reportId)}
                                            disabled={deleteReportMutation.isPending}
                                            aria-label="Delete report"
                                            className="rounded-lg p-1.5 text-[var(--text-muted)] opacity-100 transition hover:bg-red-500/10 hover:text-red-600 lg:opacity-0 lg:group-hover:opacity-100"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            );})}
                        </div>
                    </aside>

                    <main className="flex min-h-[calc(100vh-7.5rem)] flex-col bg-[var(--bg-primary)]">
                        <section className="border-b border-[var(--border)] px-4 py-3">
                            <div className="flex flex-col gap-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-[var(--accent-gold-light)] px-3 py-1 text-xs font-semibold text-[var(--accent-gold)]">Active chat</span>
                                    {selectedThread.status && <span className="rounded-full bg-[var(--bg-tertiary)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">{selectedThread.status}</span>}
                                </div>
                                <h2 className="text-xl font-bold text-[var(--text-primary)]">{selectedThread.title}</h2>
                                {!selectedThread.id.startsWith('chat:') && (
                                    <p className="max-w-3xl text-sm leading-5 text-[var(--text-secondary)]">{selectedThread.subtitle}</p>
                                )}
                            </div>
                        </section>

                        <div className="border-b border-[var(--border)] px-4 pt-3">
                            <div className="flex gap-2">
                                {(['chat', 'recommendations'] as const).map((tab) => (
                                    <button
                                        key={tab}
                                        type="button"
                                        onClick={() => setActiveSubTab(tab)}
                                        className={cn(
                                            'rounded-t-2xl px-4 py-2 text-sm font-semibold transition',
                                            activeSubTab === tab
                                                ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-sm'
                                                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                        )}
                                    >
                                        {tab === 'chat' ? 'Chat' : `Recommendations (${recommendations.length + experiments.length})`}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {activeSubTab === 'chat' ? (
                            <section className="flex min-h-0 flex-1 flex-col p-3 md:p-4">
                                <div className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]"><MessageCircle className="h-5 w-5" /> Chat With Seb</div>
                                <div className="min-h-[22rem] flex-1 space-y-4 overflow-y-auto rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                                    {chat.length === 0 && (
                                        <div className="mx-auto flex max-w-2xl flex-col items-center justify-center py-16 text-center">
                                            <Bot className="mb-4 h-12 w-12 text-[var(--accent-gold)]" />
                                            <h3 className="text-xl font-semibold text-[var(--text-primary)]">How can Seb help with this?</h3>
                                            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">Pick a recommendation on the left or ask a fresh question. Seb uses your content, chat feedback, and new connected data to keep learning.</p>
                                        </div>
                                    )}
                                    {chat.map((item, index) => (
                                        <div key={index} className={cn('flex', item.role === 'user' ? 'justify-end' : 'justify-start')}>
                                            <div className="max-w-[92%] space-y-3">
                                                <div className={cn(
                                                    'whitespace-pre-wrap rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm',
                                                    item.role === 'user'
                                                        ? 'rounded-br-md bg-[var(--accent-gold)] text-white'
                                                        : 'rounded-bl-md border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)]'
                                                )}>
                                                    {item.content}
                                                </div>
                                                {item.attachments && item.attachments.length > 0 && <MediaPreviewGrid attachments={item.attachments} onOpen={setPreview} />}
                                            </div>
                                        </div>
                                    ))}
                                    {isSelectedThreadPending && <p className="text-sm text-[var(--text-muted)]">Seb is thinking...</p>}
                                </div>
                                <div className="mt-4 flex gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-2 shadow-sm">
                                    <input
                                        value={chatMessage}
                                        onChange={(e) => setChatMessage(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                                        placeholder="Ask Seb for advice..."
                                        className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                                    />
                                    <button type="button" onClick={sendChat} disabled={isSelectedThreadPending} className="rounded-xl bg-[var(--accent-gold)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">Send</button>
                                </div>
                            </section>
                        ) : (
                            <section className="min-h-0 flex-1 overflow-y-auto p-3 md:p-5">
                                <div className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]"><Video className="h-5 w-5" /> Recommendations</div>
                                {recommendations.length === 0 && experiments.length === 0 ? (
                                    <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)] p-8 text-center text-sm text-[var(--text-secondary)]">
                                        Seb has no recommendations yet. Generate advice to create a fresh report.
                                    </div>
                                ) : (
                                    <div className="grid gap-4 xl:grid-cols-2">
                                        {recommendations.map((item) => (
                                            <article key={item.id} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                                                <div className="mb-3 flex flex-wrap items-center gap-2">
                                                    <span className="rounded-full bg-[var(--accent-gold-light)] px-2.5 py-1 text-xs font-semibold text-[var(--accent-gold)]">{item.category.replaceAll('_', ' ')}</span>
                                                    {item.platform && <span className="rounded-full bg-[var(--bg-tertiary)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">{item.platform}</span>}
                                                    <span className="rounded-full bg-[var(--bg-tertiary)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">{item.priority}</span>
                                                    <span className="rounded-full bg-[var(--bg-tertiary)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">{confidenceLabel(item.confidence)}</span>
                                                </div>
                                                <h3 className="text-base font-semibold text-[var(--text-primary)]">{item.title}</h3>
                                                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{item.advice}</p>
                                                {item.rationale && <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">Why Seb thinks this: {item.rationale}</p>}
                                                {item.impactResult && (
                                                    <div className="mt-3 rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-xs text-green-700 dark:text-green-300">
                                                        Impact checked: {String(item.impactResult.engagementRateChange ?? 'pending')} engagement-rate change.
                                                    </div>
                                                )}
                                                <div className="mt-4 flex flex-wrap gap-2">
                                                    <button type="button" onClick={() => openRecommendationChat(`recommendation:${item.id}`)} className="rounded-lg bg-[var(--bg-tertiary)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Chat about this</button>
                                                    {(['NEW', 'IN_PROGRESS', 'DONE', 'DISMISSED'] as const).map((status) => (
                                                        <button
                                                            key={status}
                                                            type="button"
                                                            onClick={() => updateRecommendationMutation.mutate({ id: item.id, status })}
                                                            className={cn(
                                                                'rounded-lg px-3 py-1.5 text-xs font-medium transition',
                                                                item.status === status
                                                                    ? 'bg-[var(--accent-gold)] text-white'
                                                                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                                            )}
                                                        >
                                                            {status.replaceAll('_', ' ')}
                                                        </button>
                                                    ))}
                                                </div>
                                            </article>
                                        ))}

                                        {experiments.map((experiment) => (
                                            <article key={experiment.id} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                                                <h3 className="text-base font-semibold text-[var(--text-primary)]">{experiment.title}</h3>
                                                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{experiment.hypothesis}</p>
                                                <p className="mt-2 text-xs text-[var(--text-muted)]">Metric: {experiment.metric}{experiment.platform ? ` · ${experiment.platform}` : ''}</p>
                                                <div className="mt-4 flex flex-wrap gap-2">
                                                    <button type="button" onClick={() => openRecommendationChat(`experiment:${experiment.id}`)} className="rounded-lg bg-[var(--bg-tertiary)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Chat about this</button>
                                                    {(['PLANNED', 'RUNNING', 'COMPLETED', 'CANCELLED'] as const).map((status) => (
                                                        <button key={status} type="button" onClick={() => updateExperimentMutation.mutate({ id: experiment.id, status })} className={cn('rounded-md px-2 py-1 text-[10px]', experiment.status === status ? 'bg-[var(--accent-gold)] text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]')}>{status}</button>
                                                    ))}
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}
                    </main>
                </div>
            )}

            {preview && <MediaPreviewModal attachment={preview} onClose={() => setPreview(null)} />}
        </div>
    );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-3">
            <p className="text-base font-bold text-[var(--text-primary)]">{value}</p>
            <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
        </div>
    );
}

function MediaPreviewGrid({ attachments, onOpen }: { attachments: MediaAttachment[]; onOpen: (attachment: MediaAttachment) => void }) {
    return (
        <div className="flex flex-wrap gap-3">
            {attachments.map((attachment) => (
                <button
                    key={`${attachment.postId || 'media'}:${attachment.id}`}
                    type="button"
                    onClick={() => onOpen(attachment)}
                    className="group w-36 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:w-44"
                >
                    <div className="relative aspect-square bg-[var(--bg-tertiary)]">
                        {attachment.type === 'video' ? (
                            <video src={attachment.url} poster={attachment.previewUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                        ) : (
                            <img src={attachment.previewUrl} alt={attachment.title} className="h-full w-full object-cover" loading="lazy" />
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-white">
                            <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                                <span>{attachment.platform || attachment.status || 'Media'}</span>
                                {attachment.type === 'video' ? <span className="flex items-center gap-1"><Play className="h-3 w-3 fill-current" />{formatDuration(attachment.duration) || 'Video'}</span> : <span>Image</span>}
                            </div>
                        </div>
                    </div>
                    <div className="p-2.5">
                        <p className="line-clamp-1 text-xs font-semibold text-[var(--text-primary)]">{attachment.title}</p>
                        {attachment.caption && <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--text-secondary)]">{attachment.caption}</p>}
                    </div>
                </button>
            ))}
        </div>
    );
}

function MediaPreviewModal({ attachment, onClose }: { attachment: MediaAttachment; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
            <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-[var(--bg-primary)] shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] p-4">
                    <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-[var(--text-primary)]">{attachment.title}</p>
                        <p className="text-xs text-[var(--text-muted)]">{attachment.platform || attachment.status || 'Media'}{attachment.type === 'video' && formatDuration(attachment.duration) ? ` · ${formatDuration(attachment.duration)}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <a href={attachment.url} target="_blank" rel="noreferrer" className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition hover:text-[var(--accent-gold)]">
                            <ExternalLink className="mr-1 inline h-3.5 w-3.5" /> Open
                        </a>
                        <button type="button" onClick={onClose} className="rounded-xl border border-[var(--border)] p-2 text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]" aria-label="Close preview">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>
                <div className="grid max-h-[calc(90vh-5rem)] overflow-auto lg:grid-cols-[1fr_20rem]">
                    <div className="flex items-center justify-center bg-black p-3">
                        {attachment.type === 'video' ? (
                            <video src={attachment.url} poster={attachment.previewUrl} className="max-h-[75vh] max-w-full rounded-xl" controls playsInline />
                        ) : (
                            <img src={attachment.previewUrl} alt={attachment.title} className="max-h-[75vh] max-w-full rounded-xl object-contain" />
                        )}
                    </div>
                    <div className="space-y-3 p-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Why Seb attached this</p>
                            <p className="mt-1 text-sm text-[var(--text-secondary)]">{attachment.rationale}</p>
                        </div>
                        {attachment.caption && (
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Post caption</p>
                                <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{attachment.caption}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
