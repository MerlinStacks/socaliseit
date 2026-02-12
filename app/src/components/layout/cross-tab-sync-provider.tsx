/**
 * CrossTabSyncProvider — Client wrapper for cross-tab cache invalidation
 * Why: Dashboard layout is a server component that can't use hooks.
 * This thin client component subscribes to BroadcastChannel events
 * and invalidates React Query caches when other tabs make changes.
 */

'use client';

import { useCrossTabSync } from '@/lib/cross-tab-sync';
import { useOrganization } from '@/hooks/use-organization';

export function CrossTabSyncProvider() {
    const { organization } = useOrganization();
    useCrossTabSync(organization?.id);
    return null;
}
