'use client';

/**
 * Push Subscription Card
 * Why: Gives mobile users a quick way to enable/disable push without
 * navigating to the full Notifications settings tab.
 */

import { Button } from '@/components/ui/button';
import { Bell, BellRing, Loader2, Smartphone } from 'lucide-react';
import { usePushNotifications } from '@/hooks/use-push-notifications';

export function PushSubscriptionCard() {
    const {
        isSupported,
        permission,
        isSubscribed,
        isVapidConfigured,
        isLoading,
        subscribe,
        unsubscribe,
    } = usePushNotifications();

    // Why: Hide entirely when browser doesn't support push or VAPID isn't set up
    if (!isSupported || !isVapidConfigured) return null;

    return (
        <div className="card p-6">
            <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-pink-light)]">
                    <BellRing className="h-5 w-5 text-[var(--accent-pink)]" />
                </div>
                <div className="flex-1">
                    <h3 className="font-semibold">Push Notifications</h3>
                    <p className="text-sm text-[var(--text-muted)]">
                        Receive notifications on this device
                    </p>
                </div>
                {isSubscribed && (
                    <span className="flex items-center gap-1 rounded-full bg-[var(--success-light)] px-3 py-1 text-xs font-medium text-[var(--success)]">
                        <Smartphone className="h-3 w-3" />
                        Active
                    </span>
                )}
            </div>

            {permission === 'denied' && (
                <p className="mb-4 rounded-lg bg-[var(--error-light)] p-3 text-sm text-[var(--error)]">
                    Notifications are blocked. Please enable them in your browser settings.
                </p>
            )}

            {isSubscribed ? (
                <Button
                    onClick={unsubscribe}
                    disabled={isLoading}
                    variant="secondary"
                    className="w-full sm:w-auto"
                >
                    {isLoading ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
                    ) : (
                        'Disable Push Notifications'
                    )}
                </Button>
            ) : (
                <Button
                    onClick={subscribe}
                    disabled={isLoading || permission === 'denied'}
                    className="w-full sm:w-auto"
                >
                    {isLoading ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
                    ) : (
                        <><Bell className="h-4 w-4" /> Enable Push Notifications</>
                    )}
                </Button>
            )}
        </div>
    );
}
