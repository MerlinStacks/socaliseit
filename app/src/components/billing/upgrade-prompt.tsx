/**
 * Upgrade Prompt Component
 *
 * Why: Shown inline when a user hits a feature gate limit.
 * Provides context on what's blocked and a CTA to upgrade.
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, X } from 'lucide-react';

interface UpgradePromptProps {
    /** The feature that's blocked */
    feature: string;
    /** Human-readable reason */
    reason?: string;
    /** Current usage / limit numbers */
    current?: number;
    limit?: number;
    /** Allow dismissal */
    dismissible?: boolean;
}

export function UpgradePrompt({ feature, reason, current, limit, dismissible = true }: UpgradePromptProps) {
    const [dismissed, setDismissed] = useState(false);

    if (dismissed) return null;

    const handleUpgrade = async () => {
        try {
            // Why: Redirect to settings billing tab — the upgrade flow lives there
            window.location.href = '/settings?tab=billing';
        } catch {
            // Fallback: direct navigation
            window.location.href = '/settings?tab=billing';
        }
    };

    return (
        <div className="relative overflow-hidden rounded-xl border border-[var(--accent-pink)]/30 bg-gradient-to-r from-[var(--accent-pink)]/5 to-[var(--accent-warm)]/5 p-4">
            {/* Decorative glow */}
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[var(--accent-pink)]/10 blur-2xl" />

            <div className="relative flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-pink)]/10">
                    <Sparkles className="h-4 w-4 text-[var(--accent-pink)]" />
                </div>

                <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">
                        {reason || `You've reached the limit for ${feature}`}
                    </p>
                    {current !== undefined && limit !== undefined && limit !== Infinity && (
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                            Using {current} of {limit} available
                        </p>
                    )}
                    <Button
                        onClick={handleUpgrade}
                        size="sm"
                        className="mt-3 bg-gradient-to-r from-[var(--accent-pink)] to-[var(--accent-warm)] text-white hover:opacity-90"
                    >
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                        Upgrade Plan
                    </Button>
                </div>

                {dismissible && (
                    <button
                        onClick={() => setDismissed(true)}
                        className="shrink-0 rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors"
                        aria-label="Dismiss"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>
        </div>
    );
}
