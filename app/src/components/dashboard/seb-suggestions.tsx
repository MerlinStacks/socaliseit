import Link from 'next/link';
import { ArrowRight, Bot, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SebSuggestion {
    id: string;
    title: string;
    advice: string;
    category: string;
    priority: string;
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
                <Link href="/seb" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-gold)] hover:underline">
                    Open Seb
                    <ArrowRight className="h-3.5 w-3.5" />
                </Link>
            </div>

            {suggestions.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-3">
                    {suggestions.slice(0, 3).map((suggestion) => (
                        <Link
                            key={suggestion.id}
                            href="/seb"
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
                        </Link>
                    ))}
                </div>
            ) : (
                <Link
                    href="/seb"
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
