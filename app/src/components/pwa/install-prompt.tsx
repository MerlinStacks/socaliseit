/**
 * PWA Install Prompt Component
 * Custom install banner with smart timing and persistent dismissal
 * 
 * Why: Native browser install prompts are often poorly timed.
 * This provides a branded prompt shown after meaningful engagement.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Download, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/hooks/use-haptic';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const STORAGE_KEY = 'pwa-install-prompt';
const DISMISS_DAYS = 7; // Days before showing again after dismiss
const MIN_VISITS = 2; // Minimum visits before showing

/**
 * Smart PWA install prompt with timing logic
 */
export function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [showBanner, setShowBanner] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);

    useEffect(() => {
        // Check if already installed (standalone mode)
        if (window.matchMedia('(display-mode: standalone)').matches) {
            setIsInstalled(true);
            return;
        }

        // Check dismissal timing
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const { dismissedAt, visits } = JSON.parse(stored);
            const daysSinceDismiss = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);

            if (dismissedAt && daysSinceDismiss < DISMISS_DAYS) {
                return; // Still within dismissal period
            }

            // Update visit count
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                visits: (visits || 0) + 1,
                dismissedAt: null,
            }));
        } else {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ visits: 1 }));
        }

        // Listen for install prompt
        const handleBeforeInstall = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);

            // Check visit count before showing
            const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            if ((data.visits || 1) >= MIN_VISITS) {
                // Delay showing banner slightly for better UX
                setTimeout(() => setShowBanner(true), 2000);
            }
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstall);

        // Listen for successful install
        window.addEventListener('appinstalled', () => {
            setIsInstalled(true);
            setShowBanner(false);
            setDeferredPrompt(null);
        });

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
        };
    }, []);

    const handleInstall = useCallback(async () => {
        if (!deferredPrompt) return;

        triggerHaptic('medium');
        await deferredPrompt.prompt();

        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            setShowBanner(false);
        }
        setDeferredPrompt(null);
    }, [deferredPrompt]);

    const handleDismiss = useCallback(() => {
        triggerHaptic('light');
        setShowBanner(false);

        // Store dismissal time
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            ...stored,
            dismissedAt: Date.now(),
        }));
    }, []);

    if (isInstalled || !showBanner || !deferredPrompt) {
        return null;
    }

    return (
        <div
            className={cn(
                'fixed bottom-20 inset-x-4 z-50 md:bottom-4 md:left-auto md:right-4 md:max-w-sm',
                'animate-in slide-in-from-bottom-4 fade-in duration-300'
            )}
        >
            <div className="relative rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 shadow-xl backdrop-blur-lg">
                {/* Close button */}
                <button
                    onClick={handleDismiss}
                    className="absolute top-2 right-2 rounded-full p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] transition-colors"
                    aria-label="Dismiss"
                >
                    <X className="h-4 w-4" />
                </button>

                <div className="flex gap-4">
                    {/* App icon */}
                    <div className="flex-shrink-0">
                        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent-gold)] to-[var(--accent-pink)] shadow-lg">
                            <Smartphone className="h-7 w-7 text-white" />
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-6">
                        <h3 className="font-semibold text-[var(--text-primary)]">
                            Install Overseek
                        </h3>
                        <p className="text-sm text-[var(--text-muted)] mt-0.5">
                            Add to home screen for the best experience
                        </p>

                        <button
                            onClick={handleInstall}
                            className="mt-3 flex items-center gap-2 rounded-lg bg-gradient px-4 py-2 text-sm font-medium text-white transition-transform active:scale-95"
                        >
                            <Download className="h-4 w-4" />
                            Install App
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Request persistent storage for the PWA
 * Prevents browser from evicting cached data under storage pressure
 */
export async function requestPersistentStorage(): Promise<boolean> {
    if (!navigator.storage?.persist) {
        return false;
    }

    try {
        const isPersisted = await navigator.storage.persisted();
        if (isPersisted) {
            return true;
        }

        const granted = await navigator.storage.persist();
        if (granted) {
            console.info('[PWA] Persistent storage granted');
        }
        return granted;
    } catch (error) {
        console.warn('[PWA] Failed to request persistent storage:', error);
        return false;
    }
}
