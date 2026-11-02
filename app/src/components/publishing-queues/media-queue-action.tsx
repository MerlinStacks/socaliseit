'use client';

/**
 * "Add to queue" for multi-selected library assets.
 *
 * Sits alongside the other selection-aware toolbar piece rather than inside
 * MediaToolbar, so the library's existing selection UI is untouched.
 */

import { useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { CalendarClock } from 'lucide-react';
import { BulkQueueDialog } from './bulk-queue-dialog';
import { fetcher } from './client';
import { useQueueCache } from './use-queue-cache';

interface Props {
    /** Selected media ids from the library page. */
    selectedIds: string[];
    onQueued: () => void;
}

export function MediaQueueAction({ selectedIds, onQueued }: Props) {
    const [open, setOpen] = useState(false);
    const { key } = useQueueCache();
    const { data: accounts } = useSWR(open ? key('accounts') : null, fetcher.accounts);

    if (selectedIds.length === 0) return null;

    return (
        <>
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
                <CalendarClock className="mr-2 h-4 w-4" />
                Add {selectedIds.length} to queue
            </Button>
            <BulkQueueDialog
                open={open}
                onOpenChange={setOpen}
                accounts={accounts ?? []}
                mediaIds={selectedIds}
                onQueued={onQueued}
            />
        </>
    );
}
