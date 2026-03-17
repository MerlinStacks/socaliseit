/**
 * Collabs Inbox Component
 * Why: Displays pending Instagram collab invites and lets users
 * accept or decline them directly from the Engagement Hub.
 */

'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X, Users2, Image, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface CollabInvite {
    id: string;
    media_type: string;
    media_url?: string;
    thumbnail_url?: string;
    caption?: string;
    timestamp: string;
    permalink?: string;
    collaborator?: {
        username?: string;
    };
}

interface CollabAccount {
    id: string;
    name: string;
    username: string;
}

/**
 * Fetches Instagram accounts and their collab invites.
 * Why: Queries the accounts API first to find Instagram accounts,
 * then fetches collabs for each one.
 */
async function fetchCollabs(): Promise<{ account: CollabAccount; invites: CollabInvite[] }[]> {
    const accountsRes = await fetch('/api/accounts');
    if (!accountsRes.ok) return [];
    const { accounts } = await accountsRes.json();

    const igAccounts = accounts.filter(
        (a: { platform: string; isActive: boolean }) => a.platform === 'INSTAGRAM' && a.isActive !== false
    );

    const results = await Promise.all(
        igAccounts.map(async (acct: CollabAccount) => {
            try {
                const res = await fetch(`/api/accounts/${acct.id}/collabs`);
                if (!res.ok) return { account: acct, invites: [] };
                const data = await res.json();
                return { account: acct, invites: data.invites || [] };
            } catch {
                return { account: acct, invites: [] };
            }
        })
    );

    return results;
}

/**
 * Instagram Collab Invites inbox.
 * Shows pending invites grouped by account with Accept/Decline actions.
 */
export function CollabsInbox() {
    const queryClient = useQueryClient();
    const [respondingId, setRespondingId] = useState<string | null>(null);

    const { data, isLoading, error } = useQuery({
        queryKey: ['collab-invites'],
        queryFn: fetchCollabs,
        staleTime: 60_000,
        refetchOnWindowFocus: false,
    });

    const respondMutation = useMutation({
        mutationFn: async ({ accountId, mediaId, action }: { accountId: string; mediaId: string; action: 'accept' | 'decline' }) => {
            const res = await fetch(`/api/accounts/${accountId}/collabs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mediaId, action }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to respond');
            }
            return res.json();
        },
        onSuccess: (_data, variables) => {
            toast('success', `Collab ${variables.action === 'accept' ? 'accepted' : 'declined'}`);
            queryClient.invalidateQueries({ queryKey: ['collab-invites'] });
            setRespondingId(null);
        },
        onError: (err: Error) => {
            toast('error', err.message);
            setRespondingId(null);
        },
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-16">
                <p className="text-sm text-[var(--error)]">Failed to load collab invites</p>
            </div>
        );
    }

    const allInvites = data?.flatMap(d => d.invites.map(inv => ({ ...inv, account: d.account }))) || [];

    if (allInvites.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                    <Users2 className="h-8 w-8 text-[var(--text-muted)]" />
                </div>
                <div className="text-center">
                    <p className="font-semibold">No Collab Invites</p>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                        When someone invites you to collaborate on a post, it will appear here.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {allInvites.map((invite) => {
                const isResponding = respondingId === invite.id;
                return (
                    <div
                        key={invite.id}
                        className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 transition-all hover:border-[var(--accent-gold-light)]"
                    >
                        {/* Thumbnail */}
                        <div className="h-14 w-14 shrink-0 rounded-lg bg-[var(--bg-tertiary)] overflow-hidden">
                            {invite.thumbnail_url || invite.media_url ? (
                                <img
                                    src={invite.thumbnail_url || invite.media_url}
                                    alt=""
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <div className="h-full w-full flex items-center justify-center">
                                    <Image className="h-5 w-5 text-[var(--text-muted)]" />
                                </div>
                            )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium text-pink-400">
                                    @{invite.collaborator?.username || 'unknown'}
                                </span>
                                <span className="text-[10px] text-[var(--text-muted)]">
                                    invited you to collaborate
                                </span>
                            </div>
                            {invite.caption && (
                                <p className="text-sm text-[var(--text-secondary)] truncate mb-2">
                                    {invite.caption}
                                </p>
                            )}
                            <p className="text-[10px] text-[var(--text-muted)]">
                                via @{invite.account.username} • {invite.media_type.toLowerCase()}
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                                size="sm"
                                variant="secondary"
                                disabled={isResponding}
                                onClick={() => {
                                    setRespondingId(invite.id);
                                    respondMutation.mutate({
                                        accountId: invite.account.id,
                                        mediaId: invite.id,
                                        action: 'accept',
                                    });
                                }}
                                className={cn(
                                    'h-8 px-3 gap-1',
                                    'hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30'
                                )}
                            >
                                {isResponding ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Check className="h-3.5 w-3.5" />
                                )}
                                <span className="hidden sm:inline text-xs">Accept</span>
                            </Button>
                            <Button
                                size="sm"
                                variant="secondary"
                                disabled={isResponding}
                                onClick={() => {
                                    setRespondingId(invite.id);
                                    respondMutation.mutate({
                                        accountId: invite.account.id,
                                        mediaId: invite.id,
                                        action: 'decline',
                                    });
                                }}
                                className="h-8 px-3 gap-1 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30"
                            >
                                <X className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline text-xs">Decline</span>
                            </Button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
