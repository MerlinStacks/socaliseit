/**
 * Today's Focus Card
 * Quick-glance dashboard widget showing today's tasks
 * Why: Gives users immediate context on what needs attention today
 */
'use client';

import Link from 'next/link';
import { CalendarCheck, MessageSquare, Sparkles, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TodaysFocusCardProps {
    postsDueToday: number;
    postsPublishedToday: number;
    unreadEngagement?: number;
    aiSuggestions?: number;
    className?: string;
}

/**
 * Compact card showing today's key metrics at a glance.
 */
export function TodaysFocusCard({
    postsDueToday,
    postsPublishedToday,
    unreadEngagement = 0,
    aiSuggestions = 0,
    className,
}: TodaysFocusCardProps) {
    const items = [
        {
            icon: CalendarCheck,
            label: 'Posts due',
            value: postsDueToday,
            href: '/calendar',
            color: 'text-[var(--accent-gold)]',
            bgColor: 'bg-[var(--accent-gold-light)]',
            show: true,
        },
        {
            icon: MessageSquare,
            label: 'Engagement',
            value: unreadEngagement,
            href: '/engagement',
            color: 'text-[var(--accent-pink)]',
            bgColor: 'bg-[var(--accent-pink-light)]',
            show: unreadEngagement > 0,
        },
        {
            icon: Sparkles,
            label: 'AI suggestions',
            value: aiSuggestions,
            href: '/compose?ai=true',
            color: 'text-[var(--info)]',
            bgColor: 'bg-[var(--info-light)]',
            show: aiSuggestions > 0,
        },
    ].filter(item => item.show);

    return (
        <div className={cn('card p-5', className)}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Today&apos;s Focus</span>
                    {postsPublishedToday > 0 && (
                        <span className="rounded-full bg-[var(--success-light)] px-2 py-0.5 text-[10px] font-medium text-[var(--success)]">
                            {postsPublishedToday} published
                        </span>
                    )}
                </div>
            </div>

            {items.length === 0 ? (
                <div className="text-center py-4">
                    <p className="text-sm text-[var(--text-muted)]">All caught up! 🎉</p>
                    <Link
                        href="/compose"
                        className="mt-2 inline-flex items-center text-sm font-medium text-[var(--accent-gold)] hover:underline"
                    >
                        Create new post
                        <ChevronRight className="ml-1 h-3 w-3" />
                    </Link>
                </div>
            ) : (
                <div className="space-y-2">
                    {items.map((item) => (
                        <Link
                            key={item.label}
                            href={item.href}
                            className="flex items-center gap-3 rounded-lg bg-[var(--bg-tertiary)] p-3 transition-colors hover:bg-[var(--bg-secondary)]"
                        >
                            <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', item.bgColor)}>
                                <item.icon className={cn('h-4 w-4', item.color)} />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-medium">{item.value}</p>
                                <p className="text-xs text-[var(--text-muted)]">{item.label}</p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
