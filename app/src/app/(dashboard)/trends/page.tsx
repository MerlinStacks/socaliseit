/**
 * Trends Page
 * Discover trending topics - placeholder state until social APIs connected
 */

'use client';

import { Button } from '@/components/ui/button';
import {
    TrendingUp, Sparkles, Music, Hash, Video,
    Link as LinkIcon
} from 'lucide-react';

export default function TrendsPage() {
    return (
        <div className="flex h-screen flex-col">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-5">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient">
                        <TrendingUp className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold">Trends</h1>
                        <p className="text-sm text-[var(--text-muted)]">
                            Discover trending topics in your niche
                        </p>
                    </div>
                </div>
            </header>

            {/* Content - Placeholder State */}
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center max-w-md">
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                        <Sparkles className="h-10 w-10 text-[var(--accent-gold)]" />
                    </div>

                    <h2 className="mt-6 text-xl font-semibold">Connect Accounts to See Trends</h2>
                    <p className="mt-2 text-[var(--text-muted)]">
                        Once you connect your social accounts, we'll show you trending topics,
                        sounds, and hashtags relevant to your niche.
                    </p>

                    <div className="mt-8 grid grid-cols-3 gap-4">
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                            <Hash className="mx-auto h-6 w-6 text-[var(--text-muted)]" />
                            <p className="mt-2 text-sm font-medium">Hashtags</p>
                            <p className="text-xs text-[var(--text-muted)]">Top performing tags</p>
                        </div>
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                            <Music className="mx-auto h-6 w-6 text-[var(--text-muted)]" />
                            <p className="mt-2 text-sm font-medium">Sounds</p>
                            <p className="text-xs text-[var(--text-muted)]">Trending audio</p>
                        </div>
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                            <Video className="mx-auto h-6 w-6 text-[var(--text-muted)]" />
                            <p className="mt-2 text-sm font-medium">Formats</p>
                            <p className="text-xs text-[var(--text-muted)]">Viral templates</p>
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
