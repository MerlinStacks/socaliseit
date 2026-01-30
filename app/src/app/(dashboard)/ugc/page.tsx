/**
 * UGC Curation Page
 * Discover user-generated content - placeholder state until social APIs connected
 */

'use client';

import { Button } from '@/components/ui/button';
import {
    Heart, Users, Image as ImageIcon,
    Link as LinkIcon, CheckCircle
} from 'lucide-react';

export default function UGCPage() {
    return (
        <div className="flex h-screen flex-col">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-5">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient">
                        <Heart className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold">UGC Curation</h1>
                        <p className="text-sm text-[var(--text-muted)]">
                            Discover and manage user-generated content
                        </p>
                    </div>
                </div>
            </header>

            {/* Content - Placeholder State */}
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center max-w-md">
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                        <Users className="h-10 w-10 text-[var(--accent-gold)]" />
                    </div>

                    <h2 className="mt-6 text-xl font-semibold">Connect Accounts to Find UGC</h2>
                    <p className="mt-2 text-[var(--text-muted)]">
                        Once connected, we'll automatically find posts where customers mention
                        your brand, making it easy to reshare and engage.
                    </p>

                    <div className="mt-8 space-y-3 text-left max-w-sm mx-auto">
                        <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                            <CheckCircle className="h-5 w-5 text-[var(--text-muted)]" />
                            <div>
                                <p className="text-sm font-medium">Find Brand Mentions</p>
                                <p className="text-xs text-[var(--text-muted)]">Automatically discover customer posts</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                            <ImageIcon className="h-5 w-5 text-[var(--text-muted)]" />
                            <div>
                                <p className="text-sm font-medium">Request Permission</p>
                                <p className="text-xs text-[var(--text-muted)]">Send DM templates for repost rights</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                            <Heart className="h-5 w-5 text-[var(--text-muted)]" />
                            <div>
                                <p className="text-sm font-medium">Reshare Content</p>
                                <p className="text-xs text-[var(--text-muted)]">Schedule approved UGC to your feed</p>
                            </div>
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
