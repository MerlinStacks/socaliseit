/**
 * Notification Permission Prompt
 * Shows a non-intrusive banner when notification permissions are denied or not yet granted.
 * Provides guidance on re-enabling from browser settings or a CTA to enable.
 * Dismissable with a 7-day cooldown.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, BellOff, X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { cn } from '@/lib/utils';

const DISMISS_KEY = 'overseek-notif-prompt-dismissed';
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function NotificationPrompt({ className }: { className?: string }) {
    const { isSupported, permission, isSubscribed, subscribe, isLoading } = usePushNotifications();
    const [isDismissed, setIsDismissed] = useState(true); // Start hidden to avoid flash
    const [isSubscribing, setIsSubscribing] = useState(false);

    // Check dismiss cooldown on mount
    useEffect(() => {
        try {
            const dismissed = localStorage.getItem(DISMISS_KEY);
            if (dismissed) {
                const elapsed = Date.now() - parseInt(dismissed, 10);
                if (elapsed < DISMISS_COOLDOWN_MS) {
                    setIsDismissed(true);
                    return;
                }
            }
            setIsDismissed(false);
        } catch {
            setIsDismissed(false);
        }
    }, []);

    const handleDismiss = useCallback(() => {
        setIsDismissed(true);
        try {
            localStorage.setItem(DISMISS_KEY, Date.now().toString());
        } catch {
            // localStorage unavailable
        }
    }, []);

    const handleEnable = useCallback(async () => {
        setIsSubscribing(true);
        await subscribe();
        setIsSubscribing(false);
    }, [subscribe]);

    // Don't show if:
    // - Already subscribed
    // - Not supported
    // - Loading initial state
    // - Dismissed
    if (!isSupported || isSubscribed || isLoading || isDismissed) {
        return null;
    }

    const isDenied = permission === 'denied';

    return (
        <div
            className={cn(
                'relative overflow-hidden rounded-xl border p-4',
                'backdrop-blur-md transition-all duration-300',
                isDenied
                    ? 'border-amber-500/20 bg-amber-500/5'
                    : 'border-[var(--accent-gold)]/20 bg-[var(--accent-gold)]/5',
                className
            )}
        >
            <button
                onClick={handleDismiss}
                className="absolute top-3 right-3 p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                aria-label="Dismiss notification prompt"
            >
                <X className="h-4 w-4" />
            </button>

            <div className="flex items-start gap-3 pr-6">
                <div
                    className={cn(
                        'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl',
                        isDenied
                            ? 'bg-amber-500/10'
                            : 'bg-[var(--accent-gold-light)]'
                    )}
                >
                    {isDenied ? (
                        <BellOff className="h-5 w-5 text-amber-500" />
                    ) : (
                        <Bell className="h-5 w-5 text-[var(--accent-gold)]" />
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold mb-1">
                        {isDenied ? 'Notifications Blocked' : 'Enable Notifications'}
                    </h4>
                    <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-3">
                        {isDenied
                            ? 'Notifications are blocked by your browser. To re-enable, open your browser settings and allow notifications for this site.'
                            : 'Get notified when posts go live, comments arrive, or scheduled posts need attention.'}
                    </p>

                    {isDenied ? (
                        <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span>Check browser address bar → site settings → notifications</span>
                        </div>
                    ) : (
                        <Button
                            size="sm"
                            onClick={handleEnable}
                            disabled={isSubscribing}
                            className="gap-1.5"
                        >
                            <Bell className="h-3.5 w-3.5" />
                            {isSubscribing ? 'Enabling...' : 'Enable Notifications'}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
