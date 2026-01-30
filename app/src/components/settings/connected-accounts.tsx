'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import {
    Instagram, Youtube, Key, Plus, ExternalLink, Trash2,
    Check, AlertCircle
} from 'lucide-react';

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

    const platforms = [
        { id: 'instagram', name: 'Instagram', icon: Instagram },
        { id: 'youtube', name: 'YouTube', icon: Youtube },
        { id: 'tiktok', name: 'TikTok', icon: Key },
        { id: 'facebook', name: 'Facebook', icon: Key },
    ];

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
                                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
                                    {account.platform === 'INSTAGRAM' && <Instagram className="h-6 w-6" />}
                                    {account.platform === 'YOUTUBE' && <Youtube className="h-6 w-6" />}
                                    {!['INSTAGRAM', 'YOUTUBE'].includes(account.platform) && <Key className="h-6 w-6" />}
                                </div>
                                <div className="flex-1">
                                    <p className="font-medium capitalize">{account.platform.toLowerCase()}</p>
                                    <p className="text-sm text-[var(--text-muted)]">{account.username || account.name}</p>
                                </div>
                                {expiring ? (
                                    <span className="flex items-center gap-1 rounded-full bg-[var(--warning-light)] px-2 py-1 text-xs font-medium text-[var(--warning)]">
                                        <AlertCircle className="h-3 w-3" />
                                        Expiring Soon
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1 rounded-full bg-[var(--success-light)] px-2 py-1 text-xs font-medium text-[var(--success)]">
                                        <Check className="h-3 w-3" />
                                        Connected
                                    </span>
                                )}
                                <div className="flex gap-2">
                                    <button className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]">
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

            {/* Add Account Dialog */}
            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Connect a Platform</DialogTitle>
                        <DialogDescription>Select a platform to connect to your account.</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-3">
                        {platforms.map((platform) => {
                            const Icon = platform.icon;
                            return (
                                <button
                                    key={platform.id}
                                    onClick={() => handleAddAccount(platform.id)}
                                    disabled={connecting !== null}
                                    className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-4 hover:bg-[var(--bg-tertiary)] disabled:opacity-50"
                                >
                                    <Icon className="h-6 w-6" />
                                    <span className="font-medium">{platform.name}</span>
                                    {connecting === platform.id && (
                                        <span className="ml-auto text-xs">Connecting...</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
