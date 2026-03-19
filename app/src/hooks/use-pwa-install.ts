/**
 * Hook to manage PWA install prompt
 * Captures the beforeinstallprompt event and provides install trigger
 * 
 * Why: Browsers only show the native install prompt once automatically.
 * We need to capture the event and trigger it ourselves at the right time.
 */

import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
    prompt: () => Promise<void>;
}

interface UsePWAInstallReturn {
    /** Whether PWA installation is available */
    isInstallAvailable: boolean;
    /** Whether the app is already installed (running in standalone mode) */
    isInstalled: boolean;
    /** Whether install prompt was dismissed by user */
    isDismissed: boolean;
    /** Trigger the install prompt */
    promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
    /** Dismiss the install banner */
    dismissInstall: () => void;
}

const DISMISS_STORAGE_KEY = 'overseek-pwa-dismissed';
const LEGACY_DISMISS_KEY = 'socialiseit-pwa-dismissed';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Detects whether app is running in standalone mode (already installed)
 */
function checkIsInstalled(): boolean {
    if (typeof window === 'undefined') return false;

    // Check display-mode media query (standard)
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    if (standaloneQuery.matches) return true;

    // iOS Safari doesn't support display-mode query
    if ('standalone' in window.navigator && (window.navigator as unknown as { standalone: boolean }).standalone === true) return true;

    return false;
}

/**
 * Checks if user previously dismissed the install prompt
 * Why: Supports both new and legacy storage keys for backward compatibility
 */
function checkIsDismissed(): boolean {
    if (typeof window === 'undefined') return false;

    try {
        // Check new key first, then legacy key
        let dismissed = localStorage.getItem(DISMISS_STORAGE_KEY);
        if (!dismissed) {
            dismissed = localStorage.getItem(LEGACY_DISMISS_KEY);
            if (dismissed) {
                // Migrate to new key
                localStorage.setItem(DISMISS_STORAGE_KEY, dismissed);
                localStorage.removeItem(LEGACY_DISMISS_KEY);
            }
        }
        if (!dismissed) return false;

        const dismissedAt = parseInt(dismissed, 10);
        if (Date.now() - dismissedAt < DISMISS_DURATION_MS) {
            return true;
        }
        // Expired, clear it
        localStorage.removeItem(DISMISS_STORAGE_KEY);
        return false;
    } catch {
        return false;
    }
}

export function usePWAInstall(): UsePWAInstallReturn {
    const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
    const [isInstalled, setIsInstalled] = useState(() => checkIsInstalled());
    const [isDismissed, setIsDismissed] = useState(() => checkIsDismissed());

    useEffect(() => {
        // If already installed, don't bother with install prompt
        if (isInstalled) return;

        const handleBeforeInstall = (e: Event) => {
            // Prevent Chrome's default mini-infobar
            e.preventDefault();
            // Store the event for later use
            setInstallEvent(e as BeforeInstallPromptEvent);
        };

        const handleAppInstalled = () => {
            setIsInstalled(true);
            setInstallEvent(null);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstall);
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, [isInstalled]);

    // Monitor display-mode changes (user installs via browser menu)
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const standaloneQuery = window.matchMedia('(display-mode: standalone)');
        const handleChange = (e: MediaQueryListEvent) => {
            if (e.matches) {
                setIsInstalled(true);
                setInstallEvent(null);
            }
        };

        standaloneQuery.addEventListener('change', handleChange);
        return () => standaloneQuery.removeEventListener('change', handleChange);
    }, []);

    const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
        if (!installEvent) return 'unavailable';

        try {
            await installEvent.prompt();
            const { outcome } = await installEvent.userChoice;

            if (outcome === 'accepted') {
                setInstallEvent(null);
            }

            return outcome;
        } catch {
            return 'unavailable';
        }
    }, [installEvent]);

    const dismissInstall = useCallback(() => {
        setIsDismissed(true);
        try {
            localStorage.setItem(DISMISS_STORAGE_KEY, Date.now().toString());
        } catch {
            // localStorage unavailable, dismissal is ephemeral
        }
    }, []);

    return {
        isInstallAvailable: !!installEvent && !isInstalled && !isDismissed,
        isInstalled,
        isDismissed,
        promptInstall,
        dismissInstall,
    };
}
