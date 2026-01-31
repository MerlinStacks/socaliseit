'use client';

/**
 * Client-side providers for the application
 * Wraps children with React Query, Toast, and Undo notifications
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import { UndoToastProvider } from '@/components/ui/undo-toast';

interface ProvidersProps {
    children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 60 * 1000,
                        refetchOnWindowFocus: false,
                    },
                },
            })
    );

    return (
        <QueryClientProvider client={queryClient}>
            <ToastProvider>
                {children}
                <UndoToastProvider />
            </ToastProvider>
        </QueryClientProvider>
    );
}
