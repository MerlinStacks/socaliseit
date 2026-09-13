import { InboxItem, inboxRequest, jsonBody, workflowTarget } from './inbox-model';

export interface InternalNote {
    id: string; body: string; authorId: string; authorName: string; createdAt: string;
    mentions: { id: string; name: string }[];
}
export interface CollaborationData {
    notes: InternalNote[];
    activity: { id: string; actorName: string; kind: string; description: string; createdAt: string }[];
    canWrite: boolean;
    pagination?: { notes: { nextCursor: string | null }; activity: { nextCursor: string | null } };
}
/** Prefer refreshed copies, with deterministic newest-first ordering across overlapping pages. */
export function collaborationStream<T extends { id: string; createdAt: string }>(pages: T[][]): T[] {
    const rows = new Map<string, T>();
    for (const page of pages) for (const row of page) if (!rows.has(row.id)) rows.set(row.id, row);
    return [...rows.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id));
}
export interface NoteDraft { body: string; mentionIds: string[]; requestId?: string }
export function readNoteDraft(value: string): NoteDraft {
    try {
        const draft = JSON.parse(value) as NoteDraft;
        if (typeof draft.body === 'string' && Array.isArray(draft.mentionIds) && draft.mentionIds.every(id => typeof id === 'string')) return draft;
    } catch { /* Empty or unavailable storage. */ }
    return { body: '', mentionIds: [] };
}
/** Any edit invalidates the retry token, including editing back to the original content. */
export function editNoteDraft(draft: NoteDraft, patch: Partial<Pick<NoteDraft, 'body' | 'mentionIds'>>): NoteDraft {
    return { ...draft, ...patch, requestId: undefined };
}
// A synchronous, scope-specific lock also covers unmount/remount while a request is pending.
const pending = new Set<string>();
const listeners = new Set<() => void>();
export const subscribeNotePending = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const isNotePending = (scope: string) => pending.has(scope);
export async function submitInternalNote(scope: string, item: InboxItem, draft: NoteDraft, retain: (draft: NoteDraft) => void) {
    if (pending.has(scope)) return false;
    if (!draft.body.trim() || draft.body.length > 5000 || draft.mentionIds.length > 20) throw new Error('Use 1–5000 characters and at most 20 mentions.');
    pending.add(scope);
    listeners.forEach(listener => listener());
    try {
        const attempt = { ...draft, requestId: draft.requestId || crypto.randomUUID() };
        retain(attempt);
        await inboxRequest<{ success: true; data: InternalNote }>('/api/inbox/collaboration', jsonBody({ ...workflowTarget(item), ...attempt }, 'POST'));
        retain({ body: '', mentionIds: [] });
        return true;
    } finally { pending.delete(scope); listeners.forEach(listener => listener()); }
}
