'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription
} from '@/components/ui/dialog';
import {
    Instagram, Youtube, Facebook, Plus, ExternalLink, Trash2,
    Check, Loader2
} from 'lucide-react';
import { InlineErrorBadge } from '@/components/ui/error-message';

/**
 * Custom TikTok icon - Lucide doesn't have an official TikTok icon
 */
function TikTokIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className={className}
            aria-hidden="true"
        >
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
        </svg>
    );
}

/**
 * Platform configuration with brand colors and styling
 * Each platform has unique gradient/color for premium visual identity
 */
const PLATFORM_CONFIG = {
    instagram: {
        id: 'instagram',
        name: 'Instagram',
        icon: Instagram,
        // Instagram's signature gradient
        gradient: 'from-[#833AB4] via-[#FD1D1D] to-[#F77737]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(131,58,180,0.4)]',
        iconBg: 'bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#F77737]',
    },
    youtube: {
        id: 'youtube',
        name: 'YouTube',
        icon: Youtube,
        gradient: 'from-[#FF0000] to-[#CC0000]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(255,0,0,0.3)]',
        iconBg: 'bg-gradient-to-br from-[#FF0000] to-[#CC0000]',
    },
    tiktok: {
        id: 'tiktok',
        name: 'TikTok',
        icon: TikTokIcon,
        // TikTok's signature cyan/magenta
        gradient: 'from-[#00F2EA] via-[#000000] to-[#FF0050]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(0,242,234,0.4)]',
        iconBg: 'bg-black',
    },
    facebook: {
        id: 'facebook',
        name: 'Facebook',
        icon: Facebook,
        gradient: 'from-[#1877F2] to-[#0D5EC4]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(24,119,242,0.4)]',
        iconBg: 'bg-gradient-to-br from-[#1877F2] to-[#0D5EC4]',
    },
} as const;

type PlatformId = keyof typeof PLATFORM_CONFIG;

export function ConnectedAccounts() {
    const [accounts, setAccounts] = useState<Array<{
        id: string;
        platform: string;
        name: string;
        username: string | null;
        tokenExpiry: string | null;
        isActive: boolean;
    }>>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [connecting, setConnecting] = useState<string | null>(null);
    const [reconnecting, setReconnecting] = useState<string | null>(null);

    // Fetch accounts on mount
    useEffect(() => {
        fetchAccounts();
    }, []);

    async function fetchAccounts() {
        try {
            const res = await fetch('/api/accounts');
            const data = await res.json();
            setAccounts(data.accounts || []);
        } catch (error) {
            console.error('Failed to fetch accounts:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleAddAccount(platform: string) {
        setConnecting(platform);
        try {
            const res = await fetch('/api/accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform }),
            });
            const data = await res.json();
            if (data.authUrl) {
                window.location.href = data.authUrl;
            }
        } catch (error) {
            console.error('Failed to initiate OAuth:', error);
        } finally {
            setConnecting(null);
            setShowAddModal(false);
        }
    }

    async function handleDeleteAccount(accountId: string) {
        if (!confirm('Are you sure you want to disconnect this account?')) return;
        try {
            await fetch('/api/accounts', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId }),
            });
            setAccounts((prev) => prev.filter((a) => a.id !== accountId));
        } catch (error) {
            console.error('Failed to disconnect account:', error);
        }
    }

    function isTokenExpiring(tokenExpiry: string | null): boolean {
        if (!tokenExpiry) return false;
        const expiry = new Date(tokenExpiry);
        const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        return expiry < sevenDaysFromNow;
    }

    /**
     * Check if token has fully expired (past expiry date)
     */
    function isTokenExpired(tokenExpiry: string | null): boolean {
        if (!tokenExpiry) return false;
        return new Date(tokenExpiry) < new Date();
    }

    /**
     * Initiate OAuth reconnection for an account with expiring/expired token
     */
    async function handleReconnect(accountId: string, platform: string) {
        setReconnecting(accountId);
        try {
            const res = await fetch('/api/accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform: platform.toLowerCase(), reconnect: true }),
            });
            const data = await res.json();
            if (data.authUrl) {
                window.location.href = data.authUrl;
            }
        } catch (error) {
            console.error('Failed to initiate reconnection:', error);
        } finally {
            setReconnecting(null);
        }
    }

    const platforms = Object.values(PLATFORM_CONFIG);

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">Connected Accounts</h2>
                <Button onClick={() => setShowAddModal(true)}>
                    <Plus className="h-4 w-4" />
                    Add Account
                </Button>
            </div>

            {loading ? (
                <div className="text-center py-8 text-[var(--text-muted)]">Loading accounts...</div>
            ) : accounts.length === 0 ? (
                <div className="card p-8 text-center">
                    <p className="text-[var(--text-muted)] mb-4">No accounts connected yet</p>
                    <Button onClick={() => setShowAddModal(true)}>
                        <Plus className="h-4 w-4" />
                        Connect your first account
                    </Button>
                </div>
            ) : (
                <div className="space-y-3">
                    {accounts.map((account) => {
                        const expiring = isTokenExpiring(account.tokenExpiry);
                        return (
                            <div key={account.id} className="card flex items-center gap-4 p-4">
                                <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-white ${PLATFORM_CONFIG[account.platform.toLowerCase() as PlatformId]?.iconBg || 'bg-[var(--bg-tertiary)]'
                                    }`}>
                                    {(() => {
                                        const config = PLATFORM_CONFIG[account.platform.toLowerCase() as PlatformId];
                                        if (config) {
                                            const Icon = config.icon;
                                            return <Icon className="h-6 w-6" />;
                                        }
                                        return <Facebook className="h-6 w-6" />;
                                    })()}
                                </div>
                                <div className="flex-1">
                                    <p className="font-medium">{account.name}</p>
                                    <p className="text-sm text-[var(--text-muted)]">
                                        {account.username ? `@${account.username}` : account.platform.toLowerCase()}
                                    </p>
                                </div>
                                {expiring ? (
                                    isTokenExpired(account.tokenExpiry) ? (
                                        <InlineErrorBadge
                                            type="error"
                                            label="Expired"
                                            action={{
                                                label: "Reconnect",
                                                onClick: () => handleReconnect(account.id, account.platform),
                                                loading: reconnecting === account.id
                                            }}
                                        />
                                    ) : (
                                        <InlineErrorBadge
                                            type="warning"
                                            label="Expiring Soon"
                                            action={{
                                                label: "Reconnect",
                                                onClick: () => handleReconnect(account.id, account.platform),
                                                loading: reconnecting === account.id
                                            }}
                                        />
                                    )
                                ) : (
                                    <span className="flex items-center gap-1 rounded-full bg-[var(--success-light)] px-2 py-1 text-xs font-medium text-[var(--success)]">
                                        <Check className="h-3 w-3" />
                                        Connected
                                    </span>
                                )}
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            const urls: Record<string, string> = {
                                                INSTAGRAM: `https://instagram.com/${account.username}`,
                                                YOUTUBE: `https://youtube.com/@${account.username}`,
                                                TIKTOK: `https://tiktok.com/@${account.username}`,
                                                FACEBOOK: `https://facebook.com/${account.username}`,
                                            };
                                            const url = urls[account.platform];
                                            if (url) window.open(url, '_blank');
                                        }}
                                        className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]"
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteAccount(account.id)}
                                        className="rounded-lg p-2 text-[var(--text-muted)] hover:text-[var(--error)]"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Add Account Dialog - Premium Glassmorphism Design */}
            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
                <DialogContent className="sm:max-w-md overflow-hidden">
                    <DialogHeader className="pb-2">
                        <DialogTitle className="text-xl font-semibold">Connect a Platform</DialogTitle>
                        <DialogDescription className="text-[var(--text-muted)]">
                            Choose a social media platform to connect to your workspace.
                        </DialogDescription>
                    </DialogHeader>

                    {/* Platform Grid with Premium Cards */}
                    <div className="grid grid-cols-2 gap-4 py-4">
                        {platforms.map((platform) => {
                            const Icon = platform.icon;
                            const isConnecting = connecting === platform.id;
                            const isDisabled = connecting !== null && !isConnecting;

                            return (
                                <button
                                    key={platform.id}
                                    onClick={() => handleAddAccount(platform.id)}
                                    disabled={connecting !== null}
                                    className={`
                                        group relative flex flex-col items-center gap-3 p-6
                                        rounded-2xl border border-white/10
                                        bg-white/5 dark:bg-slate-900/40
                                        backdrop-blur-sm
                                        transition-all duration-300 ease-out
                                        hover:scale-105 hover:bg-white/10 dark:hover:bg-slate-800/60
                                        ${platform.hoverGlow}
                                        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
                                        focus:outline-none focus:ring-2 focus:ring-white/20
                                    `}
                                >
                                    {/* Platform Icon with Brand Gradient Background */}
                                    <div className={`
                                        flex h-14 w-14 items-center justify-center
                                        rounded-xl text-white
                                        ${platform.iconBg}
                                        shadow-lg
                                        transition-transform duration-300
                                        group-hover:scale-110
                                        ${isConnecting ? 'animate-pulse' : ''}
                                    `}>
                                        {isConnecting ? (
                                            <Loader2 className="h-7 w-7 animate-spin" />
                                        ) : (
                                            <Icon className="h-7 w-7" />
                                        )}
                                    </div>

                                    {/* Platform Name */}
                                    <span className={`
                                        font-semibold text-[var(--text-primary)]
                                        transition-colors duration-200
                                        ${isDisabled ? 'opacity-50' : ''}
                                    `}>
                                        {platform.name}
                                    </span>

                                    {/* Connecting State Label */}
                                    {isConnecting && (
                                        <span className="absolute bottom-2 text-xs text-[var(--text-muted)] animate-pulse">
                                            Connecting...
                                        </span>
                                    )}

                                    {/* Subtle gradient border glow on hover */}
                                    <div className={`
                                        absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100
                                        transition-opacity duration-300
                                        bg-gradient-to-br ${platform.gradient}
                                        -z-10 blur-xl
                                    `} style={{ transform: 'scale(0.85)' }} />
                                </button>
                            );
                        })}
                    </div>

                    {/* Info Footer */}
                    <p className="text-center text-xs text-[var(--text-muted)] pt-2 border-t border-white/5">
                        You&apos;ll be redirected to authorize SocialiseIT
                    </p>
                </DialogContent>
            </Dialog>
        </div>
    );
}
