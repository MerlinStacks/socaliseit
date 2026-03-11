/**
 * PWA Install Banner Component
 * Shows a glassmorphism install prompt when PWA installation is available
 * 
 * Why: Browsers won't automatically show install prompt after the first visit.
 * This component provides a persistent, but dismissable, install CTA.
 */

'use client';

import { usePWAInstall } from '@/hooks/use-pwa-install';
import { Download, X } from 'lucide-react';
import { useState } from 'react';

export function PWAInstallBanner() {
    const { isInstallAvailable, promptInstall, dismissInstall } = usePWAInstall();
    const [isInstalling, setIsInstalling] = useState(false);

    if (!isInstallAvailable) return null;

    const handleInstall = async () => {
        setIsInstalling(true);
        await promptInstall();
        setIsInstalling(false);
    };

    return (
        <div
            className="fixed bottom-24 left-4 right-4 md:bottom-4 md:left-auto md:right-4 md:max-w-sm z-50 animate-in slide-in-from-bottom-4 duration-300"
            role="alert"
            aria-label="Install app banner"
        >
            <div className="relative overflow-hidden rounded-xl border border-white/20 bg-white/10 backdrop-blur-xl dark:bg-black/20 shadow-2xl">
                {/* Gradient accent */}
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--accent-gold,#D4A574)] to-[var(--accent-pink,#B87A94)]" />

                <div className="p-4 flex items-start gap-4">
                    {/* Icon */}
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--accent-gold,#D4A574)] to-[var(--accent-pink,#B87A94)] flex items-center justify-center shadow-lg">
                        <Download className="w-6 h-6 text-white" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground">Install Overseek Socials</h3>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Get quick access from your home screen
                        </p>

                        {/* CTA Button */}
                        <button
                            onClick={handleInstall}
                            disabled={isInstalling}
                            className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[var(--accent-gold,#D4A574)] to-[var(--accent-pink,#B87A94)] text-white font-medium text-sm shadow-md hover:shadow-lg transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-150 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isInstalling ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Installing...
                                </>
                            ) : (
                                <>
                                    <Download className="w-4 h-4" />
                                    Install App
                                </>
                            )}
                        </button>
                    </div>

                    {/* Dismiss button */}
                    <button
                        onClick={dismissInstall}
                        className="flex-shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 dark:hover:bg-white/5 transition-colors"
                        aria-label="Dismiss install banner"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
