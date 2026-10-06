'use client';

import { useRef, useState } from 'react';
import { format } from 'date-fns';
import type { CalendarPost } from '@/components/calendar/calendar-types';
import { toast } from '@/components/ui/toast';
import { handleApiError, showErrorToast } from '@/lib/api-error';

/** Page-local clipboard survives calendar navigation without crossing organizations. */
export function useCalendarClipboard(organizationId: string | undefined, onRefresh: () => Promise<void>) {
    const [clipboard, setClipboard] = useState<{ organizationId: string; post: CalendarPost } | null>(null);
    const [isPasting, setIsPasting] = useState(false);
    const pending = useRef(false);
    const copiedPost = clipboard && clipboard.organizationId === organizationId ? clipboard.post : null;

    const copyPost = (post: CalendarPost) => {
        if (!organizationId || post.isExternal) return;
        setClipboard({ organizationId, post: { ...post } });
        toast('success', 'Post copied', 'Right-click a date or time slot to paste a scheduled copy.');
    };

    const pastePost = async (date: Date, hour?: number) => {
        if (!copiedPost || pending.current) return;
        const originalTime = new Date(copiedPost.time);
        const scheduledAt = new Date(date);
        scheduledAt.setHours(hour ?? originalTime.getHours(), hour === undefined ? originalTime.getMinutes() : 0, 0, 0);
        if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
            toast('error', 'Choose a future time', 'The pasted post must be scheduled in the future.');
            return;
        }

        pending.current = true;
        setIsPasting(true);
        try {
            const response = await fetch(`/api/posts/${encodeURIComponent(copiedPost.id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'duplicate', scheduledAt: scheduledAt.toISOString() }),
            });
            if (!response.ok) {
                await handleApiError(response, 'Failed to paste post');
                return;
            }
            toast('success', 'Post pasted', `Copy scheduled for ${format(scheduledAt, 'MMM d, yyyy · h:mm a')}.`);
            // Creation succeeded even if refreshing fails; don't imply the user should paste again.
            try { await onRefresh(); } catch { toast('warning', 'Post saved', 'Refresh the calendar to see the copy.'); }
        } catch (error) {
            showErrorToast(error, 'Failed to paste post');
        } finally {
            pending.current = false;
            setIsPasting(false);
        }
    };

    return { copiedPost, copyPost, pastePost, isPasting };
}
