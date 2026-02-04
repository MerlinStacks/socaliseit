'use client';

/**
 * Bluesky Connect Dialog
 * Why: Bluesky uses AT Protocol session auth (app password) instead of OAuth.
 */

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { BlueskyIcon } from './platform-icons';

interface BlueskyConnectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    handle: string;
    onHandleChange: (value: string) => void;
    appPassword: string;
    onAppPasswordChange: (value: string) => void;
    error: string | null;
    connecting: boolean;
    onConnect: () => void;
}

export function BlueskyConnectDialog({
    open,
    onOpenChange,
    handle,
    onHandleChange,
    appPassword,
    onAppPasswordChange,
    error,
    connecting,
    onConnect,
}: BlueskyConnectDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-[var(--bg-secondary)]/95 backdrop-blur-xl border border-white/10">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0085FF] to-[#00C7FF] text-white">
                            <BlueskyIcon className="h-5 w-5" />
                        </div>
                        Connect Bluesky
                    </DialogTitle>
                    <DialogDescription className="text-[var(--text-muted)]">
                        Enter your Bluesky handle and an App Password.
                        Create an App Password in your{' '}
                        <a
                            href="https://bsky.app/settings/app-passwords"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#0085FF] hover:underline"
                        >
                            Bluesky Settings
                        </a>.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <label htmlFor="bluesky-handle" className="text-sm font-medium text-[var(--text-primary)]">
                            Handle
                        </label>
                        <Input
                            id="bluesky-handle"
                            type="text"
                            placeholder="yourhandle.bsky.social"
                            value={handle}
                            onChange={(e) => onHandleChange(e.target.value)}
                            className="bg-[var(--bg-tertiary)] border-white/10"
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="bluesky-password" className="text-sm font-medium text-[var(--text-primary)]">
                            App Password
                        </label>
                        <Input
                            id="bluesky-password"
                            type="password"
                            placeholder="xxxx-xxxx-xxxx-xxxx"
                            value={appPassword}
                            onChange={(e) => onAppPasswordChange(e.target.value)}
                            className="bg-[var(--bg-tertiary)] border-white/10"
                        />
                        <p className="text-xs text-[var(--text-muted)]">
                            Never use your main password. Create an App Password instead.
                        </p>
                    </div>

                    {error && (
                        <div className="rounded-lg bg-[var(--error-light)] px-3 py-2 text-sm text-[var(--error)]">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <Button
                            variant="secondary"
                            onClick={() => onOpenChange(false)}
                            className="flex-1"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={onConnect}
                            disabled={connecting || !handle.trim() || !appPassword.trim()}
                            className="flex-1 bg-gradient-to-r from-[#0085FF] to-[#00C7FF] hover:opacity-90"
                        >
                            {connecting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Connecting...
                                </>
                            ) : (
                                'Connect'
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
