'use client';

import type { MouseEvent } from 'react';
import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Bot, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SebSuggestion {
    id: string;
    title: string;
    advice: string;
    category: string;
    priority: string;
    status?: 'NEW' | 'IN_PROGRESS' | 'DONE' | 'DISMISSED';
    platform: string | null;
    confidence: number;
    type?: 'recommendation' | 'experiment';
}

interface SebSuggestionsProps {
    suggestions: SebSuggestion[];
}

const priorityStyles: Record<string, string> = {
    HIGH: 'border-red-500/30 bg-red-500/10 text-red-300',
    MEDIUM: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    LOW: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    PLANNED: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    RUNNING: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
};

function formatLabel(value: string | null) {
    if (!value) return null;
    return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

export function SebSuggestions({ suggestions }: SebSuggestionsProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const updateStatus = (event: MouseEvent<HTMLButtonElement>, id: string, status: NonNullable<SebSuggestion['status']>) => {
        event.stopPropagation();

        startTransition(() => {
            void (async () => {
                const res = await fetch(`/api/seb/recommendations/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status }),
                });

                if (res.ok) router.refresh();
            })();
        });
    };

    const openSuggestion = () => {
        router.push('/seb?tab=recommendations');
    };

    const openChat = (event: MouseEvent<HTMLButtonElement>, suggestion: SebSuggestion) => {
        event.stopPropagation();
        const thread = `${suggestion.type === 'experiment' ? 'experiment' : 'recommendation'}:${suggestion.id}`;
        router.push(`/seb?thread=${encodeURIComponent(thread)}`);
    };

    return (
        <section className="mb-6 max-md:mb-3 max-md:px-4">
            <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300">
                        <Bot className="h-4 w-4" />
                    </div>
                    <div>
                        <h3 className="text-sm font-medium text-[var(--text-secondary)]">Seb&apos;s Suggestions</h3>
                        <p className="text-xs text-[var(--text-muted)]">Fresh actions from your social media coach</p>
                    </div>
                </div>
                <Link href="/seb?tab=recommendations" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-gold)] hover:underline">
                    Open Seb
                    <ArrowRight className="h-3.5 w-3.5" />
                </Link>
            </div>

            {suggestions.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-3">
                    {suggestions.slice(0, 3).map((suggestion) => (
                        <article
                            key={suggestion.id}
                            role="button"
                            tabIndex={0}
                            onClick={openSuggestion}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    openSuggestion();
                                }
                            }}
                            className="group rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-400/50 hover:shadow-lg hover:shadow-indigo-500/10"
                        >
                            <div className="mb-3 flex items-center gap-2">
                                <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', priorityStyles[suggestion.priority] ?? priorityStyles.MEDIUM)}>
                                    {formatLabel(suggestion.priority)}
                                </span>
                                {suggestion.platform && (
                                    <span className="truncate text-[11px] text-[var(--text-muted)]">
                                        {formatLabel(suggestion.platform)}
                                    </span>
                                )}
                            </div>
                            <h4 className="line-clamp-2 text-sm font-semibold text-[var(--text-primary)] group-hover:text-indigo-300">
                                {suggestion.title}
                            </h4>
                            <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">
                                {suggestion.advice}
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <button type="button" onClick={(event) => openChat(event, suggestion)} className="rounded-lg bg-[var(--bg-tertiary)] px-2.5 py-1.5 text-[10px] font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]">
                                    Chat about this
                                </button>
                                {suggestion.type !== 'experiment' && (['NEW', 'IN_PROGRESS', 'DONE', 'DISMISSED'] as const).map((status) => (
                                    <button
                                        key={status}
                                        type="button"
                                        disabled={isPending}
                                        onClick={(event) => updateStatus(event, suggestion.id, status)}
                                        className={cn(
                                            'rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition disabled:opacity-60',
                                            suggestion.status === status
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
                </div>
            ) : (
                <Link
                    href="/seb?tab=recommendations"
                    className="flex items-center gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-4 transition-colors hover:bg-indigo-500/15"
                >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-200">
                        <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Ask Seb for your next best move</p>
                        <p className="text-xs text-[var(--text-muted)]">Generate a fresh report to get tailored content, timing, and creative suggestions.</p>
                    </div>
                    <ArrowRight className="h-4 w-4 flex-shrink-0 text-indigo-200" />
                </Link>
            )}
        </section>
    );
}
