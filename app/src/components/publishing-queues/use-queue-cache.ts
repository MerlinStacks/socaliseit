'use client';

import { useCallback } from 'react';
import { useSWRConfig } from 'swr';
import { useDashboardSession } from '@/components/layout/session-provider';
import { broadcastSync } from '@/lib/cross-tab-sync';

export function useQueueCache() {
    const { currentOrganizationId } = useDashboardSession();
    const { mutate } = useSWRConfig();
    const key = useCallback((...parts: string[]) => ['publishing-queues', currentOrganizationId, ...parts], [currentOrganizationId]);
    const invalidate = useCallback(async (includeBatches = true) => {
        broadcastSync('post:updated', undefined, currentOrganizationId);
        // Revalidation errors belong to the readers, not the already-committed write:
        // reporting a successful batch as failed could prompt a duplicate submission.
        await mutate(candidate => Array.isArray(candidate) && candidate[0] === 'publishing-queues'
            && candidate[1] === currentOrganizationId && (includeBatches || candidate[2] !== 'batches')).catch(() => undefined);
    }, [currentOrganizationId, mutate]);
    return { key, invalidate };
}
