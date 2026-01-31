'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Bell, Check, AlertCircle, Loader2, Copy,
    BellRing, Smartphone
} from 'lucide-react';
import { usePushNotifications } from '@/hooks/use-push-notifications';

/** Notification preference field keys */
type PreferenceKey = 'postPublished' | 'postFailed' | 'tokenExpiring' | 'weeklyDigest';

interface NotificationPreferences {
    postPublished: boolean;
    postFailed: boolean;
    tokenExpiring: boolean;
    weeklyDigest: boolean;
}

const PREFERENCE_CONFIG: { key: PreferenceKey; label: string; description: string }[] = [
    { key: 'postPublished', label: 'Post published', description: 'When your scheduled posts are published' },
    { key: 'postFailed', label: 'Post failed', description: 'When a post fails to publish' },
    { key: 'tokenExpiring', label: 'Token expiring', description: 'When a connected account token is expiring' },
    { key: 'weeklyDigest', label: 'Weekly digest', description: 'Weekly summary of your analytics' },
];

/**
 * Isolated component for notification preferences with React Query state management.
 * Fetches settings on mount and patches individual toggles with optimistic updates.
 */
function NotificationPreferencesSection() {
    const queryClient = useQueryClient();

    const { data: preferences, isLoading } = useQuery<NotificationPreferences>({
        queryKey: ['notification-settings'],
        queryFn: async () => {
            const res = await fetch('/api/settings/notifications');
            if (!res.ok) throw new Error('Failed to fetch notification settings');
            return res.json();
        },
        staleTime: 30_000, // 30 seconds
    });

    const mutation = useMutation({
        mutationFn: async (update: Partial<NotificationPreferences>) => {
            const res = await fetch('/api/settings/notifications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(update),
            });
            if (!res.ok) throw new Error('Failed to save notification settings');
            return res.json();
        },
        onMutate: async (update) => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries({ queryKey: ['notification-settings'] });

            // Snapshot previous value
            const previous = queryClient.getQueryData<NotificationPreferences>(['notification-settings']);

            // Optimistically update
            queryClient.setQueryData<NotificationPreferences>(['notification-settings'], (old) => ({
                ...old!,
                ...update,
            }));

            return { previous };
        },
        onError: (_err, _update, context) => {
            // Rollback on error
            if (context?.previous) {
                queryClient.setQueryData(['notification-settings'], context.previous);
            }
        },
        onSettled: () => {
            // Refetch to ensure consistency
            queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
        },
    });

    function handleToggle(key: PreferenceKey, checked: boolean) {
        mutation.mutate({ [key]: checked });
    }

    if (isLoading) {
        return (
            <div className="card p-6">
                <h3 className="font-semibold mb-4">Notification Preferences</h3>
                <div className="space-y-4">
                    {PREFERENCE_CONFIG.map((item) => (
                        <div key={item.key} className="flex items-center justify-between animate-pulse">
                            <div className="space-y-2">
                                <div className="h-4 w-24 bg-[var(--bg-tertiary)] rounded" />
                                <div className="h-3 w-48 bg-[var(--bg-tertiary)] rounded" />
                            </div>
                            <div className="h-6 w-11 bg-[var(--bg-tertiary)] rounded-full" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="card p-6">
            <h3 className="font-semibold mb-4">Notification Preferences</h3>
            <div className="space-y-4">
                {PREFERENCE_CONFIG.map((item) => (
                    <div key={item.key} className="flex items-center justify-between">
                        <div>
                            <p className="font-medium">{item.label}</p>
                            <p className="text-sm text-[var(--text-muted)]">{item.description}</p>
                        </div>
                        <label className="relative inline-flex cursor-pointer items-center">
                            <input
                                type="checkbox"
                                checked={preferences?.[item.key] ?? false}
                                onChange={(e) => handleToggle(item.key, e.target.checked)}
                                className="peer sr-only"
                            />
                            <div className="h-6 w-11 rounded-full bg-[var(--bg-tertiary)] peer-checked:bg-[var(--accent-gold)] peer-focus:ring-2 peer-focus:ring-[var(--accent-gold)]/50 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full" />
                        </label>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function NotificationSettings() {
    const {
        isSupported,
        permission,
        isSubscribed,
        isVapidConfigured,
        vapidPublicKey,
        isLoading,
        error,
        subscribe,
        unsubscribe,
        sendTestNotification,
        generateVapidKeys,
    } = usePushNotifications();

    const [copiedKey, setCopiedKey] = useState(false);
    const [testTitle, setTestTitle] = useState('');
    const [testBody, setTestBody] = useState('');

    async function handleCopyPublicKey() {
        if (vapidPublicKey) {
            await navigator.clipboard.writeText(vapidPublicKey);
            setCopiedKey(true);
            setTimeout(() => setCopiedKey(false), 2000);
        }
    }

    async function handleSendTest() {
        await sendTestNotification(
            testTitle || 'Test Notification',
            testBody || 'This is a test push notification from SocialiseIT!'
        );
        setTestTitle('');
        setTestBody('');
    }

    return (
        <div>
            <h2 className="text-xl font-semibold mb-6">Push Notifications</h2>

            {/* Error Display */}
            {error && (
                <div className="mb-4 rounded-lg bg-[var(--error-light)] p-3 text-sm text-[var(--error)] flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                </div>
            )}

            {/* Browser Support Check */}
            {!isSupported && (
                <div className="card p-6 text-center">
                    <AlertCircle className="h-12 w-12 mx-auto mb-4 text-[var(--warning)]" />
                    <h3 className="font-semibold mb-2">Push Notifications Not Supported</h3>
                    <p className="text-sm text-[var(--text-muted)]">
                        Your browser doesn&apos;t support push notifications. Try using Chrome, Firefox, or Edge.
                    </p>
                </div>
            )}

            {isSupported && (
                <div className="space-y-6">
                    {/* VAPID Key Configuration (Admin Section) */}
                    <div className="card p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-gold-light)]">
                                <KeyIcon className="h-5 w-5 text-[var(--accent-gold)]" />
                            </div>
                            <div className="flex-1">
                                <h3 className="font-semibold">VAPID Keys</h3>
                                <p className="text-sm text-[var(--text-muted)]">
                                    Required for Web Push notifications
                                </p>
                            </div>
                            {isVapidConfigured ? (
                                <span className="flex items-center gap-1 rounded-full bg-[var(--success-light)] px-3 py-1 text-xs font-medium text-[var(--success)]">
                                    <Check className="h-3 w-3" />
                                    Configured
                                </span>
                            ) : (
                                <span className="flex items-center gap-1 rounded-full bg-[var(--warning-light)] px-3 py-1 text-xs font-medium text-[var(--warning)]">
                                    <AlertCircle className="h-3 w-3" />
                                    Not Configured
                                </span>
                            )}
                        </div>

                        {isVapidConfigured && vapidPublicKey && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium mb-2">Public Key</label>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 rounded-lg bg-[var(--bg-tertiary)] p-3 text-xs font-mono break-all">
                                        {vapidPublicKey}
                                    </code>
                                    <button
                                        onClick={handleCopyPublicKey}
                                        className="shrink-0 rounded-lg p-2 hover:bg-[var(--bg-tertiary)]"
                                        title="Copy public key"
                                    >
                                        {copiedKey ? (
                                            <Check className="h-4 w-4 text-[var(--success)]" />
                                        ) : (
                                            <Copy className="h-4 w-4 text-[var(--text-muted)]" />
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}

                        <Button
                            onClick={generateVapidKeys}
                            disabled={isLoading}
                            variant={isVapidConfigured ? 'secondary' : 'primary'}
                        >
                            {isLoading ? (
                                <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
                            ) : isVapidConfigured ? (
                                'Regenerate Keys'
                            ) : (
                                'Generate VAPID Keys'
                            )}
                        </Button>

                        {isVapidConfigured && (
                            <p className="mt-3 text-xs text-[var(--text-muted)]">
                                Warning: Regenerating keys will invalidate all existing push subscriptions.
                            </p>
                        )}
                    </div>

                    {/* Push Subscription Section */}
                    <div className="card p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-pink-light)]">
                                <BellRing className="h-5 w-5 text-[var(--accent-pink)]" />
                            </div>
                            <div className="flex-1">
                                <h3 className="font-semibold">Push Subscription</h3>
                                <p className="text-sm text-[var(--text-muted)]">
                                    Receive notifications on this device
                                </p>
                            </div>
                            {isSubscribed ? (
                                <span className="flex items-center gap-1 rounded-full bg-[var(--success-light)] px-3 py-1 text-xs font-medium text-[var(--success)]">
                                    <Smartphone className="h-3 w-3" />
                                    Subscribed
                                </span>
                            ) : (
                                <span className="text-xs text-[var(--text-muted)]">
                                    Not subscribed
                                </span>
                            )}
                        </div>

                        {permission === 'denied' && (
                            <div className="mb-4 rounded-lg bg-[var(--error-light)] p-3 text-sm text-[var(--error)]">
                                Notifications are blocked. Please enable them in your browser settings.
                            </div>
                        )}

                        {!isVapidConfigured ? (
                            <p className="text-sm text-[var(--text-muted)]">
                                Generate VAPID keys above before enabling push notifications.
                            </p>
                        ) : isSubscribed ? (
                            <Button
                                onClick={unsubscribe}
                                disabled={isLoading}
                                variant="secondary"
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
                            >
                                {isLoading ? (
                                    <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
                                ) : (
                                    <><Bell className="h-4 w-4" /> Enable Push Notifications</>
                                )}
                            </Button>
                        )}
                    </div>

                    {/* Test Notification Section */}
                    {isSubscribed && (
                        <div className="card p-6">
                            <h3 className="font-semibold mb-4">Send Test Notification</h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Title</label>
                                    <Input
                                        type="text"
                                        value={testTitle}
                                        onChange={(e) => setTestTitle(e.target.value)}
                                        placeholder="Test Notification"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Body</label>
                                    <Input
                                        type="text"
                                        value={testBody}
                                        onChange={(e) => setTestBody(e.target.value)}
                                        placeholder="This is a test push notification!"
                                    />
                                </div>
                                <Button onClick={handleSendTest} disabled={isLoading}>
                                    {isLoading ? (
                                        <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
                                    ) : (
                                        'Send Test Notification'
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Email/In-App Notification Preferences */}
                    <NotificationPreferencesSection />
                </div>
            )}
        </div>
    );
}

// Renamed Key to KeyIcon because of conflict
import { Key as KeyIcon } from 'lucide-react';
