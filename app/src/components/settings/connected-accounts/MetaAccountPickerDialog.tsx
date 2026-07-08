'use client';

/**
 * Meta Account Picker Dialog
 * Why: When connecting Facebook or Instagram, users may manage multiple
 * pages/accounts. This dialog lets them choose which one to link.
 * Follows the same pattern as GbpLocationPickerDialog.
 */

import { Loader2, Check, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { FacebookIcon, InstagramIcon } from './platform-icons';
import type { MetaAccountOption } from './types';

interface MetaAccountPickerDialogProps {
    open: boolean;
    onClose: () => void;
    loading: boolean;
    /** 'facebook' or 'instagram' — determines the icon and labels */
    metaType: string | null;
    accounts: MetaAccountOption[];
    connecting: string | null;
    error: string | null;
    onSelectAccount: (account: MetaAccountOption) => void;
}

export function MetaAccountPickerDialog({
    open,
    onClose,
    loading,
    metaType,
    accounts,
    connecting,
    error,
    onSelectAccount,
}: MetaAccountPickerDialogProps) {
    const isFacebook = metaType === 'facebook';
    const PlatformIcon = isFacebook ? FacebookIcon : InstagramIcon;
    const platformLabel = isFacebook ? 'Facebook Page' : 'Instagram Account';
    const iconBg = isFacebook
        ? 'bg-gradient-to-br from-blue-500 to-blue-600'
        : 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400';

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent className="sm:max-w-md bg-[var(--bg-secondary)]/95 backdrop-blur-xl border border-white/10">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-white ${iconBg}`}>
                            <PlatformIcon className="h-5 w-5" />
                        </div>
                        Select {platformLabel}
                    </DialogTitle>
                    <DialogDescription className="text-[var(--text-muted)]">
                        Choose which {platformLabel.toLowerCase()} you want to connect to this organisation.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 pt-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
                            <span className="ml-2 text-sm text-[var(--text-muted)]">
                                Loading {isFacebook ? 'pages' : 'accounts'}...
                            </span>
                        </div>
                    ) : accounts.length === 0 ? (
                        <div className="text-center py-8">
                            <Users className="h-10 w-10 mx-auto text-[var(--text-muted)] mb-3" />
                            <p className="text-sm text-[var(--text-muted)]">
                                No {isFacebook ? 'pages' : 'Instagram business accounts'} found.
                            </p>
                            <p className="text-xs text-[var(--text-muted)] mt-1">
                                {isFacebook
                                    ? 'Make sure you manage at least one Facebook Page.'
                                    : 'Make sure your Instagram account is a Business or Creator account linked to a Facebook Page.'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {accounts.map((account) => (
                                <button
                                    key={account.id}
                                    onClick={() => onSelectAccount(account)}
                                    disabled={connecting !== null}
                                    className="w-full p-3 rounded-lg border border-white/10 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)]/80 hover:border-white/20 transition-all text-left flex items-center justify-between group"
                                >
                                    <div className="flex items-center gap-3">
                                        {account.picture ? (
                                            <img
                                                src={account.picture}
                                                alt={account.name}
                                                className="h-9 w-9 rounded-lg object-cover"
                                            />
                                        ) : (
                                            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg} text-white`}>
                                                <PlatformIcon className="h-4 w-4" />
                                            </div>
                                        )}
                                        <div>
                                            <p className="font-medium text-sm">{account.name}</p>
                                            {account.username && (
                                                <p className="text-xs text-[var(--text-muted)]">
                                                    @{account.username}
                                                </p>
                                            )}
                                            {account.detail && (
                                                <p className="text-xs text-[var(--text-muted)]">
                                                    {account.detail}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    {connecting === account.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />
                                    ) : (
                                        <Check className="h-4 w-4 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                                    )}
                                </button>
                            ))}
                        </div>
                    )}

                    {error && (
                        <div className="rounded-lg bg-[var(--error-light)] px-3 py-2 text-sm text-[var(--error)]">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <Button
                            variant="secondary"
                            onClick={onClose}
                            className="flex-1"
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
