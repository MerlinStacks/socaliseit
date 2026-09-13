'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { broadcastSync } from '@/lib/cross-tab-sync';
import { inboxRequest, jsonBody } from './inbox-model';

export function InboxSyncButton() {
    const [syncing, setSyncing] = useState(false);
    const client = useQueryClient();
    const sync = async () => {
        setSyncing(true);
        try {
            // allSettled preserves successful work and reports review failures independently.
            const results = await Promise.allSettled([
                inboxRequest<{ data: Record<string, number> }>('/api/engagement/sync', jsonBody({ daysSince: 30 }, 'POST')),
                inboxRequest<{ data: Record<string, number> }>('/api/reviews/sync', { method: 'POST' }),
            ]);
            results.forEach((result, index) => {
                const name = index === 0 ? 'Engagement' : 'Review';
                if (result.status === 'rejected') { toast('error', `${name} sync failed: ${result.reason instanceof Error ? result.reason.message : 'Please try again'}`); return; }
                const data = result.value.data;
                const added = (data.commentsAdded || 0) + (data.mentionsAdded || 0) + (data.dmsAdded || 0) + (data.reviewsAdded || 0);
                const updated = (data.commentsUpdated || 0) + (data.mentionsUpdated || 0) + (data.dmsUpdated || 0) + (data.reviewsUpdated || 0);
                if (data.errorCount) toast('warning', `${name} sync partially completed: ${added} new, ${updated} updated; ${data.errorCount} errors.`);
                else if (!data.accountsProcessed) toast('info', `${name} sync: no eligible connected accounts.`);
                else toast('success', `${name} synced: ${added} new, ${updated} updated.`);
            });
            await Promise.all(['comments', 'mentions', 'messages', 'inbox', 'inbox-detail', 'conversation', 'reviews', 'unread-counts'].map(key => client.invalidateQueries({ queryKey: [key] })));
            broadcastSync('inbox:updated');
        } finally { setSyncing(false); }
    };
    return <Button size="sm" variant="secondary" disabled={syncing} onClick={sync} className="gap-2 shrink-0"><RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />{syncing ? 'Syncing…' : 'Sync all'}</Button>;
}
