'use client';

/**
 * Brand Tone Settings Component
 *
 * Why: Gives users control over the AI personality used across review replies,
 * caption generation, and rewriting. Persists to the BrandVoice model via
 * PUT /api/settings/brand-voice.
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Sparkles, Plus, X, Loader2, Save, Globe, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';

// ============================================================================
// Types
// ============================================================================

interface ToneProfile {
    formality: number;
    enthusiasm: number;
    humor: number;
    directness: number;
    emotion: number;
    emojiStyle?: 'none' | 'minimal' | 'moderate' | 'heavy';
    hashtagStyle?: 'none' | 'minimal' | 'moderate' | 'heavy';
}

interface BrandVoiceData {
    toneProfile: ToneProfile | null;
    guidelines: string | null;
    samples: string[];
}

interface SebBrandKnowledge {
    websiteUrl: string | null;
    audience: string | null;
    positioning: string | null;
    products: string | null;
    offers: string | null;
    voiceRules: string | null;
    bannedTopics: string | null;
    learnedInsights: Record<string, unknown> | null;
    pendingInsights: Record<string, unknown> | null;
    websiteScannedAt: string | null;
}

const DEFAULT_TONE: ToneProfile = {
    formality: 0.5,
    enthusiasm: 0.5,
    humor: 0.3,
    directness: 0.5,
    emotion: 0.5,
    emojiStyle: 'minimal',
    hashtagStyle: 'minimal',
};

const TONE_LABELS: { key: keyof ToneProfile; label: string; low: string; high: string }[] = [
    { key: 'formality', label: 'Formality', low: 'Casual', high: 'Professional' },
    { key: 'enthusiasm', label: 'Enthusiasm', low: 'Calm', high: 'Energetic' },
    { key: 'humor', label: 'Humor', low: 'Serious', high: 'Playful' },
    { key: 'directness', label: 'Directness', low: 'Subtle', high: 'Direct' },
    { key: 'emotion', label: 'Emotion', low: 'Rational', high: 'Emotive' },
];

// ============================================================================
// Tone Slider
// ============================================================================

function ToneSlider({
    label, low, high, value, onChange,
}: {
    label: string; low: string; high: string; value: number; onChange: (v: number) => void;
}) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {Math.round(value * 100)}%
                </span>
            </div>
            <input
                type="range"
                min={0}
                max={100}
                value={Math.round(value * 100)}
                onChange={(e) => onChange(Number(e.target.value) / 100)}
                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-[var(--accent-gold)]"
                style={{ background: `linear-gradient(to right, var(--accent-gold) ${value * 100}%, var(--bg-tertiary) ${value * 100}%)` }}
            />
            <div className="flex justify-between text-[11px]" style={{ color: 'var(--text-muted)' }}>
                <span>{low}</span>
                <span>{high}</span>
            </div>
        </div>
    );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * Brand tone configuration panel rendered inside Settings → Brand Tone tab.
 */
export function BrandToneSettings() {
    const queryClient = useQueryClient();
    const [tone, setTone] = useState<ToneProfile>(DEFAULT_TONE);
    const [guidelines, setGuidelines] = useState('');
    const [samples, setSamples] = useState<string[]>([]);
    const [newSample, setNewSample] = useState('');
    const [websiteUrl, setWebsiteUrl] = useState('');

    // ── Fetch existing brand voice ──────────────────────────────────────
    const { data, isLoading } = useQuery({
        queryKey: ['brand-voice'],
        queryFn: async () => {
            const res = await fetch('/api/settings/brand-voice');
            if (!res.ok) throw new Error('Failed to load brand voice');
            return res.json() as Promise<{ success: boolean; data: BrandVoiceData | null }>;
        },
        staleTime: 60_000,
    });

    const sebKnowledgeQuery = useQuery({
        queryKey: ['seb-brand-knowledge'],
        queryFn: async () => {
            const res = await fetch('/api/seb/brand-knowledge');
            if (!res.ok) throw new Error('Failed to load Seb brand knowledge');
            return res.json() as Promise<{ knowledge: SebBrandKnowledge | null }>;
        },
        staleTime: 60_000,
    });

    // Hydrate local state when data arrives
    useEffect(() => {
        if (data?.data) {
            const d = data.data;
            if (d.toneProfile) setTone({ ...DEFAULT_TONE, ...d.toneProfile });
            if (d.guidelines) setGuidelines(d.guidelines);
            if (d.samples) setSamples(d.samples);
        }
    }, [data]);

    useEffect(() => {
        if (sebKnowledgeQuery.data?.knowledge?.websiteUrl) {
            setWebsiteUrl(sebKnowledgeQuery.data.knowledge.websiteUrl);
        }
    }, [sebKnowledgeQuery.data]);

    // ── Save mutation ───────────────────────────────────────────────────
    const saveMutation = useMutation({
        mutationFn: async () => {
            const { emojiStyle, hashtagStyle, ...toneSliders } = tone;
            const res = await fetch('/api/settings/brand-voice', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    toneProfile: toneSliders,
                    emojiStyle,
                    hashtagStyle,
                    guidelines: guidelines.trim(),
                    samples,
                }),
            });
            if (!res.ok) throw new Error('Failed to save');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['brand-voice'] });
            toast('success', 'Brand tone saved', 'Your AI features will now use these settings.');
        },
        onError: () => {
            toast('error', 'Save failed', 'Could not save brand tone settings.');
        },
    });

    const scanWebsiteMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/seb/brand-knowledge/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ websiteUrl: websiteUrl.trim() }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Failed to scan website');
            return body;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['seb-brand-knowledge'] });
            toast('success', 'Website scanned', 'Seb found brand details for you to review.');
        },
        onError: (error) => {
            toast('error', 'Scan failed', error instanceof Error ? error.message : 'Could not scan website.');
        },
    });

    const approveSebKnowledgeMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/seb/brand-knowledge/approve', { method: 'POST' });
            if (!res.ok) throw new Error('Failed to approve Seb insights');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['seb-brand-knowledge'] });
            toast('success', 'Seb knowledge approved', 'Seb will use these brand details in future advice.');
        },
        onError: () => {
            toast('error', 'Approval failed', 'Could not approve Seb insights.');
        },
    });

    // ── Handlers ────────────────────────────────────────────────────────
    const updateTone = useCallback((key: keyof ToneProfile, value: number) => {
        setTone((prev) => ({ ...prev, [key]: value }));
    }, []);

    const addSample = useCallback(() => {
        const trimmed = newSample.trim();
        if (!trimmed || samples.length >= 5) return;
        setSamples((prev) => [...prev, trimmed]);
        setNewSample('');
    }, [newSample, samples.length]);

    const removeSample = useCallback((idx: number) => {
        setSamples((prev) => prev.filter((_, i) => i !== idx));
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--accent-gold)' }} />
            </div>
        );
    }

    const sebKnowledge = sebKnowledgeQuery.data?.knowledge;
    const pendingInsights = sebKnowledge?.pendingInsights;
    const pendingEntries = pendingInsights ? [
        ['Audience', pendingInsights.audience],
        ['Positioning', pendingInsights.positioning],
        ['Products or services', pendingInsights.products],
        ['Offers', pendingInsights.offers],
        ['Voice rules', pendingInsights.voiceRules],
        ['Topics to avoid', pendingInsights.bannedTopics],
    ].filter(([, value]) => typeof value === 'string' && value.trim()) as Array<[string, string]> : [];

    return (
        <div>
            <h2 className="text-xl font-semibold mb-1 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[var(--accent-gold)]" />
                Brand Tone
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                Configure how the AI speaks on your behalf — review replies, caption
                generation, and rewrites all use these settings.
            </p>

            <div className="space-y-8">
                <section className="card p-6 space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <h3 className="text-base font-medium flex items-center gap-2">
                                <Globe className="h-4 w-4 text-[var(--accent-gold)]" />
                                Seb Website Learning
                            </h3>
                            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                                Give Seb your business website so it can discover audience, positioning, products, offers, and voice rules when it lacks context.
                            </p>
                        </div>
                        {sebKnowledge?.websiteScannedAt && (
                            <span className="rounded-full bg-[var(--bg-tertiary)] px-3 py-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                                Last scanned {new Date(sebKnowledge.websiteScannedAt).toLocaleDateString()}
                            </span>
                        )}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                            type="url"
                            value={websiteUrl}
                            onChange={(e) => setWebsiteUrl(e.target.value)}
                            placeholder="https://example.com"
                            className="min-w-0 flex-1 rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[var(--accent-gold)]"
                            style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)' }}
                        />
                        <Button
                            onClick={() => scanWebsiteMutation.mutate()}
                            disabled={!websiteUrl.trim() || scanWebsiteMutation.isPending}
                            className="gap-2"
                        >
                            {scanWebsiteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            {scanWebsiteMutation.isPending ? 'Scanning...' : 'Scan Website'}
                        </Button>
                    </div>

                    {pendingInsights && (
                        <div className="rounded-xl border p-4" style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)' }}>
                            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="text-sm font-medium">Review Seb's discovered brand details</p>
                                    {typeof pendingInsights.crawlSummary === 'string' && (
                                        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{pendingInsights.crawlSummary}</p>
                                    )}
                                </div>
                                <Button
                                    size="sm"
                                    onClick={() => approveSebKnowledgeMutation.mutate()}
                                    disabled={approveSebKnowledgeMutation.isPending}
                                    className="gap-2"
                                >
                                    {approveSebKnowledgeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                    Approve
                                </Button>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {pendingEntries.map(([label, value]) => (
                                    <div key={label} className="rounded-lg bg-[var(--bg-secondary)] p-3">
                                        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</p>
                                        <p className="text-sm leading-5">{value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </section>

                {/* ── Tone sliders ─────────────────────────────────────── */}
                <section className="card p-6 space-y-5">
                    <h3 className="text-base font-medium">Tone Profile</h3>
                    {TONE_LABELS.map(({ key, label, low, high }) => (
                        <ToneSlider
                            key={key}
                            label={label}
                            low={low}
                            high={high}
                            value={tone[key] as number}
                            onChange={(v) => updateTone(key, v)}
                        />
                    ))}
                </section>

                {/* ── Vocabulary style ────────────────────────────────── */}
                <section className="card p-6 space-y-4">
                    <h3 className="text-base font-medium">Vocabulary Style</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="mb-1.5 block text-sm font-medium">Emoji Usage</label>
                            <select
                                value={tone.emojiStyle ?? 'minimal'}
                                onChange={(e) => setTone((p) => ({ ...p, emojiStyle: e.target.value as ToneProfile['emojiStyle'] }))}
                                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[var(--accent-gold)]"
                                style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)' }}
                            >
                                <option value="none">None</option>
                                <option value="minimal">Minimal</option>
                                <option value="moderate">Moderate</option>
                                <option value="heavy">Heavy</option>
                            </select>
                        </div>

                        <div>
                            <label className="mb-1.5 block text-sm font-medium">Hashtag Usage</label>
                            <select
                                value={tone.hashtagStyle ?? 'minimal'}
                                onChange={(e) => setTone((p) => ({ ...p, hashtagStyle: e.target.value as ToneProfile['hashtagStyle'] }))}
                                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[var(--accent-gold)]"
                                style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)' }}
                            >
                                <option value="none">None</option>
                                <option value="minimal">Minimal</option>
                                <option value="moderate">Moderate</option>
                                <option value="heavy">Heavy</option>
                            </select>
                        </div>
                    </div>
                </section>

                {/* ── Brand guidelines ────────────────────────────────── */}
                <section className="card p-6 space-y-3">
                    <h3 className="text-base font-medium">Brand Guidelines</h3>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Describe your brand voice rules, words to avoid, preferred phrases, etc.
                    </p>
                    <textarea
                        value={guidelines}
                        onChange={(e) => setGuidelines(e.target.value)}
                        maxLength={2000}
                        rows={4}
                        placeholder="e.g. Always address users by first name. Never use slang. End replies with a call-to-action."
                        className="w-full rounded-lg border px-3 py-2.5 text-sm resize-none outline-none focus:border-[var(--accent-gold)]"
                        style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)' }}
                    />
                    <p className="text-[11px] text-right" style={{ color: 'var(--text-muted)' }}>
                        {guidelines.length}/2000
                    </p>
                </section>

                {/* ── Sample captions ─────────────────────────────────── */}
                <section className="card p-6 space-y-3">
                    <h3 className="text-base font-medium">Sample Captions</h3>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Paste up to 5 example captions so the AI can learn your style.
                    </p>

                    {samples.map((s, i) => (
                        <div
                            key={i}
                            className="flex items-start gap-2 rounded-lg border p-3 text-sm"
                            style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)' }}
                        >
                            <p className="flex-1 whitespace-pre-wrap break-words line-clamp-3">{s}</p>
                            <button
                                onClick={() => removeSample(i)}
                                className="shrink-0 rounded p-1 hover:bg-[var(--bg-secondary)]"
                                aria-label="Remove sample"
                            >
                                <X className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
                            </button>
                        </div>
                    ))}

                    {samples.length < 5 && (
                        <div className="flex gap-2">
                            <textarea
                                value={newSample}
                                onChange={(e) => setNewSample(e.target.value)}
                                maxLength={2200}
                                rows={2}
                                placeholder="Paste a caption that represents your brand voice…"
                                className="flex-1 rounded-lg border px-3 py-2 text-sm resize-none outline-none focus:border-[var(--accent-gold)]"
                                style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)' }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        addSample();
                                    }
                                }}
                            />
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={addSample}
                                disabled={!newSample.trim()}
                                className="shrink-0 self-end"
                            >
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </section>

                {/* ── Save ────────────────────────────────────────────── */}
                <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    className="gap-2"
                >
                    {saveMutation.isPending
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Save className="h-4 w-4" />}
                    {saveMutation.isPending ? 'Saving…' : 'Save Brand Tone'}
                </Button>
            </div>
        </div>
    );
}
