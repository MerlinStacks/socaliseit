'use client';

/**
 * Client-side providers for the application
 * Wraps children with React Query, Toast, and Undo notifications
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { useState, type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import { UndoToastProvider } from '@/components/ui/undo-toast';
import { PWAInstallBanner } from '@/components/ui/pwa-install-banner';
import { OfflineIndicator } from '@/components/ui/offline-indicator';

interface ProvidersProps {
    children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        // 5 minutes: social media data rarely changes within minutes,
                        // and this prevents redundant refetches on page navigation.
                        staleTime: 5 * 60 * 1000,
                        // 10 minutes: keep cached data longer so navigating back
                        // to a page is instant instead of showing a loading state.
                        gcTime: 10 * 60 * 1000,
                        refetchOnWindowFocus: false,
                        // Disable retry for rate limit errors to prevent avalanche
                        retry: (failureCount, error) => {
                            // Don't retry on rate limit (429) or auth errors (401/403)
                            if (error instanceof Error && 'status' in error) {
                                const status = (error as { status: number }).status;
                                if (status === 429 || status === 401 || status === 403) {
                                    return false;
                                }
                            }
                            // Default: retry up to 3 times for other errors
                            return failureCount < 3;
                        },
                    },
                },
            })
    );

    return (
        <SessionProvider refetchOnWindowFocus={false}>
            <QueryClientProvider client={queryClient}>
                <ToastProvider>
                    {children}
                    <UndoToastProvider />
                    <PWAInstallBanner />
                    <OfflineIndicator />
                </ToastProvider>
            </QueryClientProvider>
        </SessionProvider>
    );
}
