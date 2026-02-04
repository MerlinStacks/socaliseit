'use client';

/**
 * Pinterest Connect Dialog
 * Why: Pinterest uses Late.dev OAuth for easier connection flow.
 */

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { PinterestIcon } from './platform-icons';

interface PinterestConnectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    checkingConfig: boolean;
    lateConfigured: boolean | null;
    profileId: string;
    onProfileIdChange: (value: string) => void;
    error: string | null;
    connecting: boolean;
    onConnect: () => void;
}

export function PinterestConnectDialog({
    open,
    onOpenChange,
    checkingConfig,
    lateConfigured,
    profileId,
    onProfileIdChange,
    error,
    connecting,
    onConnect,
}: PinterestConnectDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-[var(--bg-secondary)]/95 backdrop-blur-xl border border-white/10">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#E60023] to-[#BD081C] text-white">
                            <PinterestIcon className="h-5 w-5" />
                        </div>
                        Connect Pinterest
                    </DialogTitle>
                    <DialogDescription className="text-[var(--text-muted)]">
                        {checkingConfig ? (
                            'Checking configuration...'
                        ) : lateConfigured ? (
                            'Connect via Late.dev for seamless Pinterest integration.'
                        ) : (
                            'Late.dev API key required for Pinterest connection.'
                        )}
                    </DialogDescription>
                </DialogHeader>

                {checkingConfig ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
                    </div>
                ) : lateConfigured ? (
                    <div className="space-y-4 pt-4">
                        <div className="p-4 rounded-lg bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 text-white font-bold text-lg">
                                    L
                                </div>
                                <div>
                                    <h4 className="font-medium text-sm">Late.dev Integration</h4>
                                    <p className="text-xs text-[var(--text-muted)]">One-click OAuth connection</p>
                                </div>
                            </div>
                            <p className="text-xs text-[var(--text-muted)] mt-2">
                                You&apos;ll be redirected to Pinterest to authorize access to your account.
                            </p>
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-1 block">
                                Late.dev Profile ID for Pinterest
                            </label>
                            <Input
                                type="text"
                                value={profileId}
                                onChange={(e) => onProfileIdChange(e.target.value)}
                                placeholder="Enter your Late.dev Profile ID"
                                className="bg-[var(--bg-tertiary)] border-white/10"
                            />
                            <p className="text-xs text-[var(--text-muted)] mt-1">
                                Find this in your Late.dev dashboard for this platform
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
                                disabled={connecting}
                                className="flex-1 bg-gradient-to-r from-[#E60023] to-[#BD081C] hover:opacity-90"
                            >
                                {connecting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        Connecting...
                                    </>
                                ) : (
                                    'Connect with Late.dev'
                                )}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 pt-4">
                        <div className="p-3 rounded-lg bg-[var(--warning-light)] border border-[var(--warning)]/20">
                            <p className="text-xs text-[var(--warning)]">
                                <strong>Late.dev not configured.</strong> Go to Settings → API Integrations to set up
                                Late.dev for Pinterest connection.
                            </p>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <Button
                                variant="secondary"
                                onClick={() => onOpenChange(false)}
                                className="flex-1"
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
