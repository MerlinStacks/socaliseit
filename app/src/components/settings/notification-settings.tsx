'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Bell, Check, AlertCircle, Loader2,
    BellRing, Smartphone
} from 'lucide-react';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { NotificationPrompt } from '@/components/pwa/notification-prompt';
import { DeviceRegistry } from '@/components/settings/device-registry';
import { NotificationPreferencesSection } from '@/components/settings/notification-preferences';

export function NotificationSettings() {
    const {
        isSupported,
        permission,
        isSubscribed,
        isVapidConfigured,
        isLoading,
        error,
        subscribe,
        unsubscribe,
        sendTestNotification,
    } = usePushNotifications();

    const [testTitle, setTestTitle] = useState('');
    const [testBody, setTestBody] = useState('');

    async function handleSendTest() {
        await sendTestNotification(
            testTitle || 'Test Notification',
            testBody || 'This is a test push notification from Overseek Socials!'
        );
        setTestTitle('');
        setTestBody('');
    }

    return (
        <div>
            <h2 className="text-xl font-semibold mb-6">Push Notifications</h2>

            {/* Permission prompt — shown when not subscribed or denied */}
            <NotificationPrompt className="mb-6" />

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
                    {/* VAPID Status (read-only — keys are managed by super admin) */}
                    {!isVapidConfigured && (
                        <div className="card p-6">
                            <div className="flex items-center gap-3">
                                <AlertCircle className="h-5 w-5 text-[var(--warning)]" />
                                <p className="text-sm text-[var(--text-muted)]">
                                    Push notifications are not yet enabled for this platform.
                                    A super admin must configure VAPID keys first.
                                </p>
                            </div>
                        </div>
                    )}

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
                                Push notifications are unavailable until a super admin configures VAPID keys.
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

                    {/* Registered Devices for Targeted Notifications */}
                    <DeviceRegistry />

                    {/* Email/In-App Notification Preferences */}
                    <NotificationPreferencesSection />
                </div>
            )}
        </div>
    );
}
