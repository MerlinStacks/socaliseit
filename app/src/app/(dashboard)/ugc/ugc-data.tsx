/**
 * UGC data component (server-side, streamed via Suspense)
 * Why: DB queries run here while the page shell shows a loading skeleton instantly.
 */

import { db } from '@/lib/db';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
    Heart, Users, Image as ImageIcon,
    Link as LinkIcon, CheckCircle
} from 'lucide-react';
import { UGCClientWrapper } from './ugc-client';

export async function UGCData({ organizationId }: { organizationId: string }) {
    // Fetch connected accounts
    const socialAccounts = await db.socialAccount.findMany({
        where: { organizationId, isActive: true },
    });

    const hasAccounts = socialAccounts.length > 0;
    const hasInstagram = socialAccounts.some(a => a.platform === 'INSTAGRAM');

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

            {/* Content */}
            <div className="flex-1 overflow-auto p-8">
                {!hasAccounts ? (
                    /* Empty State - No Accounts */
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center max-w-md">
                            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                                <Users className="h-10 w-10 text-[var(--accent-gold)]" />
                            </div>

                            <h2 className="mt-6 text-xl font-semibold">Connect Accounts to Find UGC</h2>
                            <p className="mt-2 text-[var(--text-muted)]">
                                Once connected, we&apos;ll automatically find posts where customers mention
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

                            <Link href="/settings?tab=integrations">
                                <Button className="mt-8">
                                    <LinkIcon className="h-4 w-4" />
                                    Connect Social Accounts
                                </Button>
                            </Link>
                        </div>
                    </div>
                ) : !hasInstagram ? (
                    /* Has accounts but no Instagram */
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center max-w-md">
                            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                                <Heart className="h-10 w-10 text-[var(--accent-gold)]" />
                            </div>
                            <h2 className="mt-6 text-xl font-semibold">Connect Instagram for UGC</h2>
                            <p className="mt-2 text-[var(--text-muted)]">
                                UGC discovery currently requires an Instagram Business account.
                                Connect one to search hashtags and find user content.
                            </p>
                            <Link href="/settings?tab=integrations">
                                <Button className="mt-6">
                                    <LinkIcon className="h-4 w-4" />
                                    Connect Instagram
                                </Button>
                            </Link>
                        </div>
                    </div>
                ) : (
                    /* Has Instagram - Show search interface */
                    <UGCClientWrapper hasAccounts={hasAccounts} organizationId={organizationId} />
                )}
            </div>
        </div>
    );
}
