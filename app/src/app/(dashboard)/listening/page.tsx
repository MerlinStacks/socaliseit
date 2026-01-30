/**
 * Social Listening Page
 * Monitor brand mentions and sentiment - placeholder state until social APIs connected
 */

'use client';

import { Button } from '@/components/ui/button';
import {
    Search, Bell, MessageCircle, AtSign,
    Link as LinkIcon, TrendingUp
} from 'lucide-react';

export default function ListeningPage() {
    return (
        <div className="flex h-screen flex-col">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-5">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient">
                        <Search className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold">Social Listening</h1>
                        <p className="text-sm text-[var(--text-muted)]">
                            Monitor brand mentions and sentiment
                        </p>
                    </div>
                </div>
            </header>

            {/* Content - Placeholder State */}
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center max-w-md">
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                        <Bell className="h-10 w-10 text-[var(--accent-gold)]" />
                    </div>

                    <h2 className="mt-6 text-xl font-semibold">Connect Accounts for Listening</h2>
                    <p className="mt-2 text-[var(--text-muted)]">
                        Monitor what people are saying about your brand across social platforms
                        in real-time once you connect your accounts.
                    </p>

                    <div className="mt-8 grid grid-cols-2 gap-4">
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                            <AtSign className="mx-auto h-6 w-6 text-[var(--text-muted)]" />
                            <p className="mt-2 text-sm font-medium">Brand Mentions</p>
                            <p className="text-xs text-[var(--text-muted)]">Track @mentions</p>
                        </div>
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                            <MessageCircle className="mx-auto h-6 w-6 text-[var(--text-muted)]" />
                            <p className="mt-2 text-sm font-medium">Comments</p>
                            <p className="text-xs text-[var(--text-muted)]">Monitor engagement</p>
                        </div>
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                            <TrendingUp className="mx-auto h-6 w-6 text-[var(--text-muted)]" />
                            <p className="mt-2 text-sm font-medium">Sentiment</p>
                            <p className="text-xs text-[var(--text-muted)]">Analyze mood</p>
                        </div>
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                            <Bell className="mx-auto h-6 w-6 text-[var(--text-muted)]" />
                            <p className="mt-2 text-sm font-medium">Alerts</p>
                            <p className="text-xs text-[var(--text-muted)]">Real-time notifications</p>
                        </div>
                    </div>

                    <Button className="mt-8" onClick={() => window.location.href = '/settings?tab=integrations'}>
                        <LinkIcon className="h-4 w-4" />
                        Connect Social Accounts
                    </Button>
                </div>
            </div>
        </div>
    );
}
