'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Brain, CheckCircle2, Clock, MessageCircle, RefreshCw, Sparkles, Target, TrendingUp, Video } from 'lucide-react';
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
    evidence?: Record<string, unknown> | null;
    citations?: Array<{ type?: string; label?: string; id?: string }> | null;
    impactResult?: Record<string, unknown> | null;
};

type Experiment = {
    id: string;
    title: string;
    hypothesis: string;
    platform?: string | null;
    metric: string;
    status: 'PLANNED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED';
    baseline?: Record<string, unknown> | null;
};

type Report = {
    id: string;
    title: string;
    summary: string;
    overallScore?: number | null;
    scoreBreakdown?: Record<string, number> | null;
    confidence: number;
    status: 'GENERATING' | 'COMPLETED' | 'FAILED';
    trigger: string;
    createdAt: string;
    recommendations: Recommendation[];
    experiments?: Experiment[];
};

type BrandKnowledge = {
    audience?: string | null;
    positioning?: string | null;
    products?: string | null;
    offers?: string | null;
    voiceRules?: string | null;
    bannedTopics?: string | null;
    learnedInsights?: unknown;
    pendingInsights?: unknown;
};

const FIELD_LABELS: Array<[keyof BrandKnowledge, string, string]> = [
    ['audience', 'Audience', 'Who the brand is trying to reach'],
    ['positioning', 'Positioning', 'What makes the brand different'],
    ['products', 'Products and services', 'Core offers Seb should understand'],
    ['offers', 'Current offers', 'Promotions, launches, seasonal pushes'],
    ['voiceRules', 'Voice rules', 'Words, tone, phrases, and style preferences'],
    ['bannedTopics', 'Avoid', 'Topics, claims, or language Seb should not recommend'],
];

function confidenceLabel(confidence: number) {
    if (confidence >= 0.75) return 'High confidence';
    if (confidence >= 0.45) return 'Medium confidence';
    return 'Low confidence';
}

function formatDate(value?: string) {
    if (!value) return 'Not yet';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function SebClient() {
    const queryClient = useQueryClient();
    const [chatMessage, setChatMessage] = useState('');
    const [chatSessionId, setChatSessionId] = useState<string | undefined>();
    const [chat, setChat] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
    const [knowledgeDraft, setKnowledgeDraft] = useState<BrandKnowledge>({});

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

    const knowledgeQuery = useQuery({
        queryKey: ['seb-brand-knowledge'],
        queryFn: async () => {
            const res = await fetch('/api/seb/brand-knowledge');
            if (!res.ok) throw new Error('Failed to load brand knowledge');
            const data = await res.json() as { knowledge: BrandKnowledge | null };
            setKnowledgeDraft(data.knowledge || {});
            return data;
        },
        staleTime: 60_000,
    });

    const generateMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/seb/report/generate', { method: 'POST' });
            if (!res.ok) throw new Error((await res.json()).error || 'Failed to generate report');
            return res.json();
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['seb-report'] }),
    });

    const saveKnowledgeMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/seb/brand-knowledge', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(knowledgeDraft),
            });
            if (!res.ok) throw new Error('Failed to save brand knowledge');
            return res.json();
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['seb-brand-knowledge'] }),
    });

    const approveKnowledgeMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/seb/brand-knowledge/approve', { method: 'POST' });
            if (!res.ok) throw new Error('Failed to approve Seb knowledge');
            return res.json();
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['seb-brand-knowledge'] }),
    });

    const impactMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/seb/impact/check', { method: 'POST' });
            if (!res.ok) throw new Error('Failed to check impact');
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

    const chatMutation = useMutation({
        mutationFn: async (message: string) => {
            const res = await fetch('/api/seb/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: chatSessionId, message }),
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Seb chat failed');
            return res.json() as Promise<{ session: { id: string }; message: { content: string } }>;
        },
        onSuccess: (data) => {
            setChatSessionId(data.session.id);
            setChat((items) => [...items, { role: 'assistant', content: data.message.content }]);
        },
    });

    const latest = reportsQuery.data?.latest;
    const recommendations = latest?.recommendations || [];
    const experiments = latest?.experiments || [];
    const doneCount = recommendations.filter((item) => item.status === 'DONE').length;

    const sendChat = () => {
        const message = chatMessage.trim();
        if (!message) return;
        setChat((items) => [...items, { role: 'user', content: message }]);
        setChatMessage('');
        chatMutation.mutate(message);
    };

    return (
        <div className="min-h-screen p-4 md:p-8">
            <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--accent-gold)]">
                        <Sparkles className="h-4 w-4" />
                        Proactive AI social coach
                    </div>
                    <h1 className="text-3xl font-bold text-[var(--text-primary)]">Seb</h1>
                    <p className="mt-2 max-w-3xl text-[var(--text-secondary)]">
                        Friendly, evidence-backed advice for captions, creative, video, competitors, brand knowledge, and every connected platform.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => generateMutation.mutate()}
                    disabled={generateMutation.isPending}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-gold)] px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:opacity-90 disabled:opacity-60"
                >
                    <RefreshCw className={cn('h-4 w-4', generateMutation.isPending && 'animate-spin')} />
                    {generateMutation.isPending ? 'Queued...' : 'Regenerate Advice'}
                </button>
            </div>

            {reportsQuery.isLoading ? (
                <div className="glass-card p-8 text-[var(--text-secondary)]">Loading Seb...</div>
            ) : !latest ? (
                <div className="glass-card p-8">
                    <Bot className="mb-4 h-10 w-10 text-[var(--accent-gold)]" />
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">Seb is ready to learn your brand.</h2>
                    <p className="mt-2 text-[var(--text-secondary)]">Generate the first report to review recent posts, analytics, competitors, and media.</p>
                </div>
            ) : (
                <div className="grid gap-5 lg:grid-cols-3">
                    <section className="glass-card p-6 lg:col-span-2">
                        <div className="mb-5 flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-semibold text-[var(--text-primary)]">{latest.title}</h2>
                                <p className="mt-1 text-sm text-[var(--text-muted)]">{latest.status === 'GENERATING' ? 'Seb is still reviewing...' : `Generated ${formatDate(latest.createdAt)} via ${latest.trigger.toLowerCase()}`}</p>
                            </div>
                            <div className="rounded-2xl bg-[var(--accent-gold-light)] px-4 py-3 text-center">
                                <p className="text-2xl font-bold text-[var(--accent-gold)]">{latest.overallScore ?? '--'}</p>
                                <p className="text-xs text-[var(--text-muted)]">Seb score</p>
                            </div>
                        </div>
                        <p className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 text-[var(--text-secondary)]">{latest.summary}</p>

                        {latest.status === 'GENERATING' && (
                            <div className="mt-4 rounded-xl border border-[var(--accent-gold)]/30 bg-[var(--accent-gold-light)] p-4 text-sm text-[var(--accent-gold)]">
                                Seb is analysing video frames, analytics, competitors, brand knowledge, and platform knowledge in the background. This page will refresh automatically.
                            </div>
                        )}

                        <div className="mt-5 grid gap-3 md:grid-cols-4">
                            <Metric icon={Target} label="Advice items" value={recommendations.length.toString()} />
                            <Metric icon={CheckCircle2} label="Completed" value={doneCount.toString()} />
                            <Metric icon={Brain} label="Confidence" value={`${Math.round(latest.confidence * 100)}%`} />
                            <Metric icon={Clock} label="Refresh" value="Daily" />
                        </div>
                        {latest.scoreBreakdown && Object.keys(latest.scoreBreakdown).length > 0 && (
                            <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                {Object.entries(latest.scoreBreakdown).map(([key, value]) => (
                                    <div key={key} className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                                        <div className="mb-2 flex items-center justify-between text-sm">
                                            <span className="capitalize text-[var(--text-secondary)]">{key.replace(/([A-Z])/g, ' $1')}</span>
                                            <span className="font-semibold text-[var(--text-primary)]">{Math.round(Number(value))}</span>
                                        </div>
                                        <div className="h-2 rounded-full bg-[var(--bg-tertiary)]"><div className="h-2 rounded-full bg-[var(--accent-gold)]" style={{ width: `${Math.min(Math.max(Number(value), 0), 100)}%` }} /></div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="glass-card p-6">
                        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]"><TrendingUp className="h-5 w-5" /> Progress</h2>
                        <div className="space-y-3">
                            {(reportsQuery.data?.history || []).slice(0, 6).map((report) => (
                                <div key={report.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{report.title}</p>
                                        <span className="text-sm font-semibold text-[var(--accent-gold)]">{report.overallScore ?? '--'}</span>
                                    </div>
                                    <p className="mt-1 text-xs text-[var(--text-muted)]">{formatDate(report.createdAt)}</p>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            )}

            <div className="mt-5 grid gap-5 xl:grid-cols-3">
                <section className="glass-card p-6 xl:col-span-2">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]"><Video className="h-5 w-5" /> Recommendations</h2>
                        <button type="button" onClick={() => impactMutation.mutate()} disabled={impactMutation.isPending} className="rounded-lg bg-[var(--bg-tertiary)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-60">
                            {impactMutation.isPending ? 'Checking...' : 'Check Impact'}
                        </button>
                    </div>
                    <div className="space-y-4">
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
                                {item.citations && item.citations.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {item.citations.map((citation, index) => (
                                            <span key={index} className="rounded-lg bg-[var(--bg-tertiary)] px-2 py-1 text-xs text-[var(--text-muted)]">
                                                {citation.type}: {citation.label || citation.id || 'source'}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {item.impactResult && (
                                    <div className="mt-3 rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-xs text-green-700 dark:text-green-300">
                                        Impact checked: {String(item.impactResult.engagementRateChange ?? 'pending')} engagement-rate change.
                                    </div>
                                )}
                                <div className="mt-4 flex flex-wrap gap-2">
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
                        {recommendations.length === 0 && <p className="text-[var(--text-secondary)]">Seb has not created recommendations yet.</p>}
                    </div>
                </section>

                <aside className="space-y-5">
                    {experiments.length > 0 && (
                        <section className="glass-card p-6">
                            <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Seb Experiments</h2>
                            <div className="space-y-3">
                                {experiments.map((experiment) => (
                                    <div key={experiment.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                                        <p className="font-medium text-[var(--text-primary)]">{experiment.title}</p>
                                        <p className="mt-1 text-xs text-[var(--text-secondary)]">{experiment.hypothesis}</p>
                                        <p className="mt-1 text-xs text-[var(--text-muted)]">Metric: {experiment.metric}{experiment.platform ? ` · ${experiment.platform}` : ''}</p>
                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                            {(['PLANNED', 'RUNNING', 'COMPLETED', 'CANCELLED'] as const).map((status) => (
                                                <button key={status} type="button" onClick={() => updateExperimentMutation.mutate({ id: experiment.id, status })} className={cn('rounded-md px-2 py-1 text-[10px]', experiment.status === status ? 'bg-[var(--accent-gold)] text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]')}>{status}</button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    <section className="glass-card p-6">
                        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]"><MessageCircle className="h-5 w-5" /> Chat With Seb</h2>
                        <div className="mb-3 max-h-80 space-y-3 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                            {chat.length === 0 && <p className="text-sm text-[var(--text-muted)]">Ask Seb how to improve content, captions, videos, timing, or competitor positioning.</p>}
                            {chat.map((item, index) => (
                                <div key={index} className={cn('rounded-xl p-3 text-sm', item.role === 'user' ? 'bg-[var(--accent-gold)] text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]')}>
                                    {item.content}
                                </div>
                            ))}
                            {chatMutation.isPending && <p className="text-sm text-[var(--text-muted)]">Seb is thinking...</p>}
                        </div>
                        <div className="flex gap-2">
                            <input
                                value={chatMessage}
                                onChange={(e) => setChatMessage(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                                placeholder="Ask Seb for advice..."
                                className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-gold)]"
                            />
                            <button type="button" onClick={sendChat} className="rounded-xl bg-[var(--accent-gold)] px-4 py-2 text-sm font-semibold text-white">Send</button>
                        </div>
                    </section>

                    <section className="glass-card p-6">
                        <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Brand Knowledge</h2>
                        {knowledgeDraft.pendingInsights ? (
                            <div className="mb-4 rounded-xl border border-[var(--accent-gold)]/30 bg-[var(--accent-gold-light)] p-3">
                                <p className="text-sm font-medium text-[var(--accent-gold)]">Seb has suggested new brand knowledge.</p>
                                <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-xs text-[var(--text-secondary)]">{JSON.stringify(knowledgeDraft.pendingInsights, null, 2)}</pre>
                                <button type="button" onClick={() => approveKnowledgeMutation.mutate()} className="mt-3 rounded-lg bg-[var(--accent-gold)] px-3 py-2 text-xs font-semibold text-white">Approve Seb Learning</button>
                            </div>
                        ) : null}
                        <div className="space-y-3">
                            {FIELD_LABELS.map(([key, label, placeholder]) => (
                                <label key={key} className="block">
                                    <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">{label}</span>
                                    <textarea
                                        value={(knowledgeDraft[key] as string | null | undefined) || ''}
                                        onChange={(e) => setKnowledgeDraft((draft) => ({ ...draft, [key]: e.target.value }))}
                                        placeholder={placeholder}
                                        rows={2}
                                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-gold)]"
                                    />
                                </label>
                            ))}
                            <button
                                type="button"
                                onClick={() => saveKnowledgeMutation.mutate()}
                                disabled={saveKnowledgeMutation.isPending || knowledgeQuery.isLoading}
                                className="w-full rounded-xl bg-[var(--accent-gold)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                            >
                                {saveKnowledgeMutation.isPending ? 'Saving...' : 'Save Brand Knowledge'}
                            </button>
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
}

function Metric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
    return (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
            <Icon className="mb-2 h-4 w-4 text-[var(--accent-gold)]" />
            <p className="text-lg font-bold text-[var(--text-primary)]">{value}</p>
            <p className="text-xs text-[var(--text-muted)]">{label}</p>
        </div>
    );
}
