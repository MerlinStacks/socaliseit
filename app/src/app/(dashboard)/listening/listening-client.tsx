/**
 * Social Listening Client Actions
 * Client-side components for syncing and filtering mentions
 */
'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Eye, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ListeningClientActionsProps {
    unreadCount: number;
}

export function ListeningClientActions({ unreadCount }: ListeningClientActionsProps) {
    const [isSyncing, setIsSyncing] = useState(false);
    const router = useRouter();

    const handleSync = useCallback(async () => {
        setIsSyncing(true);
        try {
            const response = await fetch('/api/sync/mentions', {
                method: 'POST',
            });

            if (!response.ok) {
                throw new Error('Sync failed');
            }

            // Refresh the page to show new data
            router.refresh();
        } catch (error) {
            console.error('Failed to sync mentions:', error);
        } finally {
            setIsSyncing(false);
        }
    }, [router]);

    return (
        <div className="flex items-center gap-2">
            {unreadCount > 0 && (
                <span className="px-2 py-1 rounded-full bg-[var(--accent-gold-light)] text-[var(--accent-gold)] text-xs font-medium">
                    {unreadCount} unread
                </span>
            )}
            <Button
                variant="secondary"
                size="sm"
                onClick={handleSync}
                disabled={isSyncing}
            >
                {isSyncing ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Syncing...
                    </>
                ) : (
                    <>
                        <RefreshCw className="h-4 w-4" />
                        Sync
                    </>
                )}
            </Button>
        </div>
    );
}
