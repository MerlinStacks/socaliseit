'use client';

/**
 * Manual Connect Dialog
 * Why: Allows users to create a "Remind to Post" account with a custom platform name
 * (e.g., Lemon8, Snapchat). No OAuth — just a name input that creates a manual SocialAccount.
 */

import { useState } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface ManualConnectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    connecting: boolean;
    onConnect: (platformName: string, displayName: string) => void;
}

/** Max length for user-defined platform names */
const MAX_PLATFORM_NAME_LENGTH = 30;

export function ManualConnectDialog({
    open,
    onOpenChange,
    connecting,
    onConnect,
}: ManualConnectDialogProps) {
    const [platformName, setPlatformName] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [error, setError] = useState<string | null>(null);

    /** Validate and submit the manual account creation */
    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const trimmed = platformName.trim();

        if (!trimmed) {
            setError('Platform name is required');
            return;
        }
        if (trimmed.length > MAX_PLATFORM_NAME_LENGTH) {
            setError(`Platform name must be ${MAX_PLATFORM_NAME_LENGTH} characters or less`);
            return;
        }

        setError(null);
        onConnect(trimmed, displayName.trim() || trimmed);
    }

    /** Reset form state when dialog closes */
    function handleOpenChange(nextOpen: boolean) {
        if (!nextOpen) {
            setPlatformName('');
            setDisplayName('');
            setError(null);
        }
        onOpenChange(nextOpen);
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md bg-[var(--bg-secondary)]/95 backdrop-blur-xl border border-white/10">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9] text-white">
                            <Bell className="h-5 w-5" />
                        </div>
                        Remind to Post
                    </DialogTitle>
                    <DialogDescription className="text-[var(--text-muted)]">
                        Add a platform that doesn&apos;t support direct publishing.
                        You&apos;ll receive a reminder notification when it&apos;s time to post.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    {/* Platform Name */}
                    <div className="space-y-2">
                        <label htmlFor="manual-platform-name" className="text-sm font-medium text-[var(--text-primary)]">
                            Platform Name
                        </label>
                        <Input
                            id="manual-platform-name"
                            placeholder="e.g. Lemon8, Snapchat, WhatsApp..."
                            value={platformName}
                            onChange={(e) => setPlatformName(e.target.value)}
                            maxLength={MAX_PLATFORM_NAME_LENGTH}
                            disabled={connecting}
                            className="bg-[var(--bg-tertiary)] border-white/10"
                            autoFocus
                        />
                        <p className="text-xs text-[var(--text-muted)]">
                            {platformName.length}/{MAX_PLATFORM_NAME_LENGTH} characters
                        </p>
                    </div>

                    {/* Account Display Name (optional) */}
                    <div className="space-y-2">
                        <label htmlFor="manual-display-name" className="text-sm font-medium text-[var(--text-primary)]">
                            Account Name (optional)
                        </label>
                        <Input
                            id="manual-display-name"
                            placeholder="e.g. @mybrand"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            disabled={connecting}
                            className="bg-[var(--bg-tertiary)] border-white/10"
                        />
                        <p className="text-xs text-[var(--text-muted)]">
                            A label to distinguish this account from others
                        </p>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="rounded-lg bg-[var(--error-light)] px-3 py-2 text-sm text-[var(--error)]">
                            {error}
                        </div>
                    )}

                    {/* Info banner */}
                    <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 text-sm text-[var(--text-muted)]">
                        <p className="font-medium text-violet-400 mb-1">How it works</p>
                        <ul className="space-y-1 text-xs">
                            <li>• Compose and schedule posts as usual</li>
                            <li>• At publish time, you&apos;ll get a push notification</li>
                            <li>• Copy the content and post it manually</li>
                        </ul>
                    </div>

                    {/* Submit */}
                    <div className="flex gap-3 pt-2">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => handleOpenChange(false)}
                            className="flex-1"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="flex-1 bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9] hover:opacity-90"
                            disabled={connecting || !platformName.trim()}
                        >
                            {connecting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Connecting...
                                </>
                            ) : (
                                'Add Platform'
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
