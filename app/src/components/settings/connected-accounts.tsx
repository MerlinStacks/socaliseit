'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription
} from '@/components/ui/dialog';
import {
    Instagram, Youtube, Facebook, Plus, ExternalLink, Trash2,
    Check, Loader2, Linkedin, Globe
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
 * Custom Pinterest icon - Lucide doesn't have a Pinterest icon
 */
function PinterestIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className={className}
            aria-hidden="true"
        >
            <path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z" />
        </svg>
    );
}

/**
 * Custom Google icon for Google Business Profile
 */
function GoogleIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className={className}
            aria-hidden="true"
        >
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
    );
}

/**
 * Custom Bluesky icon
 */
function BlueskyIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className={className}
            aria-hidden="true"
        >
            <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z" />
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
    pinterest: {
        id: 'pinterest',
        name: 'Pinterest',
        icon: PinterestIcon,
        gradient: 'from-[#E60023] to-[#BD081C]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(230,0,35,0.4)]',
        iconBg: 'bg-gradient-to-br from-[#E60023] to-[#BD081C]',
    },
    linkedin: {
        id: 'linkedin',
        name: 'LinkedIn',
        icon: Linkedin,
        gradient: 'from-[#0A66C2] to-[#004182]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(10,102,194,0.4)]',
        iconBg: 'bg-gradient-to-br from-[#0A66C2] to-[#004182]',
    },
    google_business: {
        id: 'google_business',
        name: 'Google Business',
        icon: GoogleIcon,
        gradient: 'from-[#4285F4] via-[#34A853] to-[#EA4335]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(66,133,244,0.4)]',
        iconBg: 'bg-gradient-to-br from-[#4285F4] via-[#34A853] to-[#EA4335]',
    },
    bluesky: {
        id: 'bluesky',
        name: 'Bluesky',
        icon: BlueskyIcon,
        gradient: 'from-[#0085FF] to-[#00C7FF]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(0,133,255,0.4)]',
        iconBg: 'bg-gradient-to-br from-[#0085FF] to-[#00C7FF]',
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
                                                PINTEREST: `https://pinterest.com/${account.username}`,
                                                LINKEDIN: `https://linkedin.com/in/${account.username}`,
                                                GOOGLE_BUSINESS: `https://business.google.com`,
                                                BLUESKY: `https://bsky.app/profile/${account.username}`,
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
