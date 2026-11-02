/**
 * Client-side access to the publishing-queue API.
 *
 * Why shared: three surfaces (settings tab, media-library action, bulk dialog)
 * all talk to the same endpoints, and the error wording should match the
 * server's, which already explains the queue-specific failures.
 */

export type FillMode = 'NEXT' | 'LAST' | 'AVAILABLE';

export interface QueueSlot {
    id?: string;
    daysOfWeek: number[];
    time: string;
    enabled?: boolean;
}

export interface QueueSummary {
    id: string;
    label: string;
    name: string;
    timezone: string;
    enabled: boolean;
    socialAccountId: string;
    accountName: string;
    platform: string;
    slotCount: number;
    scheduledCount: number;
    openCount: number;
    nextAt: string | null;
}

export interface QueueAccountOption {
    id: string;
    name: string;
    platform: string;
    queues: Array<{ id: string; label: string; name: string; slots: QueueSlot[] }>;
}

export interface QueueDetail {
    id: string;
    label: string;
    name: string;
    timezone: string;
    enabled: boolean;
    socialAccountId: string;
    accountName: string;
    platform: string;
    slots: Array<{ id: string; daysOfWeek: number[]; time: string; enabled: boolean }>;
    items: Array<{ id: string; postId: string | null; caption: string; scheduledAt: string | null }>;
    preview: Array<{ slotId: string; at: string; taken: boolean }>;
}

export interface BatchSummary {
    id: string;
    kind: string;
    status: string;
    mode: string;
    label: string | null;
    totalItems: number;
    processedItems: number;
    failedItems: number;
    createdAt: string;
}

export interface BatchDetail extends BatchSummary {
    error: string | null;
    completedAt: string | null;
    items: Array<{
        id: string;
        position: number;
        status: string;
        error: string | null;
        sourceName: string | null;
        caption: string;
        placements: Array<{ itemId: string; status: string; scheduledAt: string | null; queue: string }>;
    }>;
}

export const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const MODE_LABELS: Record<FillMode, string> = {
    NEXT: 'Queue next — take the earliest slot and push the rest back',
    LAST: 'Queue last — add after everything already queued',
    AVAILABLE: 'Queue available — fill the next open slot',
};

export async function readApi<T>(response: Response): Promise<T> {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Request failed');
    return (payload.data ?? payload) as T;
}

export const fetcher = {
    queues: () => fetch('/api/publishing-queues', { cache: 'no-store' }).then(r => readApi<QueueSummary[]>(r)),
    accounts: () => fetch('/api/publishing-queues?accounts=true', { cache: 'no-store' }).then(r => readApi<QueueAccountOption[]>(r)),
    queue: (id: string) => fetch(`/api/publishing-queues/${id}`, { cache: 'no-store' }).then(r => readApi<QueueDetail>(r)),
    batches: () => fetch('/api/publishing-queues/bulk', { cache: 'no-store' }).then(r => readApi<BatchSummary[]>(r)),
    batch: (id: string) => fetch(`/api/publishing-queues/bulk/${id}`, { cache: 'no-store' }).then(r => readApi<BatchDetail>(r)),
};

export function postJson(url: string, method: string, body: unknown) {
    return fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

export function formatSlotTime(iso: string, timezone: string): string {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone, weekday: 'short', hour: 'numeric', minute: '2-digit',
    }).format(new Date(iso));
}

/** Turns [1,2,3] into "Mon–Wed"; keeps single days named. Used in summaries. */
export function describeDays(days: number[]): string {
    if (days.length === 7) return 'Every day';
    if (days.length === 5 && days[0] === 1 && days[4] === 5) return 'Weekdays';
    if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Weekends';
    return days.map(day => DAY_NAMES[day]).join(', ');
}
