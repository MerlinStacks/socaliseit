/**
 * Push Notifications Hook
 * Manages push notification subscription state and actions
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

interface PushNotificationState {
    /** Browser supports push notifications */
    isSupported: boolean;
    /** Current notification permission state */
    permission: NotificationPermission | 'default';
    /** User has active push subscription */
    isSubscribed: boolean;
    /** VAPID public key is configured for workspace */
    isVapidConfigured: boolean;
    /** VAPID public key */
    vapidPublicKey: string | null;
    /** Loading state */
    isLoading: boolean;
    /** Error message if any */
    error: string | null;
}

interface UsePushNotificationsReturn extends PushNotificationState {
    /** Request permission and subscribe to push notifications */
    subscribe: () => Promise<void>;
    /** Unsubscribe from push notifications */
    unsubscribe: () => Promise<void>;
    /** Send a test notification */
    sendTestNotification: (title?: string, body?: string) => Promise<void>;
    /** Generate new VAPID keys (admin only) */
    generateVapidKeys: () => Promise<void>;
    /** Refresh state */
    refresh: () => Promise<void>;
}

/**
 * Convert base64 URL-safe string to Uint8Array for applicationServerKey
 */
function urlBase64ToUint8Array(base64String: string): BufferSource {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray.buffer as ArrayBuffer;
}

export function usePushNotifications(): UsePushNotificationsReturn {
    const [state, setState] = useState<PushNotificationState>({
        isSupported: false,
        permission: 'default',
        isSubscribed: false,
        isVapidConfigured: false,
        vapidPublicKey: null,
        isLoading: true,
        error: null,
    });

    /**
     * Check if browser supports push notifications
     */
    const checkSupport = useCallback(() => {
        return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    }, []);

    /**
     * Fetch current state from server
     */
    const refresh = useCallback(async () => {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        try {
            const isSupported = checkSupport();
            const permission = isSupported ? Notification.permission : 'default';

            // Fetch VAPID configuration
            const vapidRes = await fetch('/api/settings/vapid');
            const vapidData = await vapidRes.json();

            // Fetch subscription status
            const subRes = await fetch('/api/push/subscribe');
            const subData = await subRes.json();

            setState({
                isSupported,
                permission,
                isSubscribed: subData.isSubscribed || false,
                isVapidConfigured: vapidData.isConfigured || false,
                vapidPublicKey: vapidData.publicKey || null,
                isLoading: false,
                error: null,
            });
        } catch (err) {
            console.error('Failed to refresh push state:', err);
            setState((prev) => ({
                ...prev,
                isLoading: false,
                error: 'Failed to load push notification settings',
            }));
        }
    }, [checkSupport]);

    /**
     * Subscribe to push notifications
     */
    const subscribe = useCallback(async () => {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        try {
            if (!state.isSupported) {
                throw new Error('Push notifications are not supported in this browser');
            }

            if (!state.vapidPublicKey) {
                throw new Error('VAPID keys not configured. Ask an admin to generate them in Settings.');
            }

            // Request notification permission
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                setState((prev) => ({
                    ...prev,
                    permission,
                    isLoading: false,
                    error: permission === 'denied' ? 'Notification permission denied' : 'Permission not granted',
                }));
                return;
            }

            // Get service worker registration
            const registration = await navigator.serviceWorker.ready;

            // Subscribe to push
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(state.vapidPublicKey),
            });

            // Send subscription to server
            const subJson = subscription.toJSON();
            const response = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    endpoint: subJson.endpoint,
                    keys: subJson.keys,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to save subscription');
            }

            setState((prev) => ({
                ...prev,
                permission: 'granted',
                isSubscribed: true,
                isLoading: false,
                error: null,
            }));
        } catch (err) {
            console.error('Failed to subscribe:', err);
            setState((prev) => ({
                ...prev,
                isLoading: false,
                error: err instanceof Error ? err.message : 'Failed to subscribe',
            }));
        }
    }, [state.isSupported, state.vapidPublicKey]);

    /**
     * Unsubscribe from push notifications
     */
    const unsubscribe = useCallback(async () => {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();

            if (subscription) {
                // Unsubscribe locally
                await subscription.unsubscribe();

                // Remove from server
                await fetch('/api/push/subscribe', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint: subscription.endpoint }),
                });
            }

            setState((prev) => ({
                ...prev,
                isSubscribed: false,
                isLoading: false,
                error: null,
            }));
        } catch (err) {
            console.error('Failed to unsubscribe:', err);
            setState((prev) => ({
                ...prev,
                isLoading: false,
                error: err instanceof Error ? err.message : 'Failed to unsubscribe',
            }));
        }
    }, []);

    /**
     * Send a test notification
     */
    const sendTestNotification = useCallback(async (title?: string, body?: string) => {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        try {
            const response = await fetch('/api/push/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, body }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to send notification');
            }

            setState((prev) => ({ ...prev, isLoading: false, error: null }));
        } catch (err) {
            console.error('Failed to send test notification:', err);
            setState((prev) => ({
                ...prev,
                isLoading: false,
                error: err instanceof Error ? err.message : 'Failed to send notification',
            }));
        }
    }, []);

    /**
     * Generate new VAPID keys (admin only)
     */
    const generateVapidKeys = useCallback(async () => {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        try {
            const response = await fetch('/api/settings/vapid', {
                method: 'POST',
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate VAPID keys');
            }

            setState((prev) => ({
                ...prev,
                isVapidConfigured: true,
                vapidPublicKey: data.publicKey,
                isSubscribed: false, // Subscriptions are invalidated when keys change
                isLoading: false,
                error: null,
            }));
        } catch (err) {
            console.error('Failed to generate VAPID keys:', err);
            setState((prev) => ({
                ...prev,
                isLoading: false,
                error: err instanceof Error ? err.message : 'Failed to generate keys',
            }));
        }
    }, []);

    // Initialize state on mount
    useEffect(() => {
        refresh();
    }, [refresh]);

    return {
        ...state,
        subscribe,
        unsubscribe,
        sendTestNotification,
        generateVapidKeys,
        refresh,
    };
}
