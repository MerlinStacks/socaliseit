/** Frontend contracts and identity helpers for the engagement inbox. */
export type InboxType = 'comment' | 'mention' | 'dm' | 'review';
export type InboxQueue = 'open' | 'mine' | 'all' | 'snoozed' | 'resolved';
export interface InboxWorkflow {
    status: 'open' | 'snoozed' | 'resolved';
    snoozedUntil: string | null;
    assignedToId: string | null;
    labelIds: string[];
}
export interface InboxItem {
    id: string;
    type: InboxType;
    socialAccountId: string;
    socialAccount: { id: string; name: string; platform: string; avatar: string | null };
    platform: string;
    authorId: string;
    authorUsername: string;
    authorAvatar: string | null;
    text: string | null;
    mediaUrl?: string | null;
    permalink?: string | null;
    isRead: boolean;
    createdAt: string;
    lastActivityAt?: string;
    messageCount?: number;
    unreadCount?: number;
    sentiment?: string | null;
    workflow: InboxWorkflow;
    meta: {
        conversationId?: string;
        platformCommentId?: string;
        platformPostId?: string;
        mentionType?: string;
        rating?: number;
        reviewId?: string;
        platformReviewId?: string;
        isReplied?: boolean;
        replyText?: string | null;
        reviewUrl?: string | null;
    };
}
export interface InboxOptions {
    accounts: { id: string; name: string; platform: string }[];
    members: { id: string; name: string }[];
    labels: { id: string; name: string; color: string }[];
}
export interface InboxFilters {
    type: InboxType | 'all';
    queue: InboxQueue;
    q: string;
    socialAccountId: string;
    platform: string;
    sentiment: string;
}
export const typeNames = { all: 'All types', comment: 'Comments', mention: 'Mentions', dm: 'Direct messages', review: 'Reviews' };
export const queues: { id: InboxQueue; name: string; description: string }[] = [
    { id: 'open', name: 'Needs attention', description: 'Open conversations ready for a response.' },
    { id: 'mine', name: 'Assigned to me', description: 'Your open conversations, in one place.' },
    { id: 'all', name: 'All', description: 'Every conversation across your connected accounts.' },
    { id: 'snoozed', name: 'Snoozed', description: 'Conversations set aside until later.' },
    { id: 'resolved', name: 'Resolved', description: 'Completed conversations and replies.' },
];
export function legacyInboxType(tab: string | null): InboxFilters['type'] {
    const types: Record<string, InboxFilters['type']> = { comments: 'comment', mentions: 'mention', messages: 'dm', reviews: 'review' };
    return tab && Object.hasOwn(types, tab) ? types[tab] : 'all';
}
export function conversationId(item: InboxItem) {
    return item.type === 'dm' ? item.meta.conversationId || item.id : item.meta.platformCommentId || item.id;
}
/** DM representative row IDs change with activity; conversation identity must not. */
export function inboxKey(item: InboxItem) {
    return JSON.stringify([item.type, item.socialAccountId, item.type === 'dm' ? conversationId(item) : item.id]);
}
export function workflowTarget(item: InboxItem) {
    return { id: item.id, type: item.type, socialAccountId: item.socialAccountId };
}
/** Owned detail responses are raw entities, unlike the normalized queue rows. */
export type InboxEntity = Omit<InboxItem, 'meta' | 'authorId' | 'authorUsername' | 'authorAvatar' | 'platform'> & Partial<Pick<InboxItem, 'authorId' | 'authorUsername' | 'authorAvatar' | 'platform'>> & {
    senderId?: string; senderUsername?: string; senderAvatar?: string | null; direction?: string;
    authorName?: string; conversationId?: string; platformCommentId?: string; platformPostId?: string;
    mentionType?: string; rating?: number; platformReviewId?: string; isReplied?: boolean;
    replyText?: string | null; reviewUrl?: string | null;
};
export function normalizeInboxEntity(row: InboxEntity, type: InboxType, accountId: string): InboxItem {
    if (row.socialAccountId !== accountId || row.socialAccount?.id !== accountId || row.type !== type) throw new Error('This notification does not match the requested account or conversation type.');
    return { ...row, type, platform: row.socialAccount.platform,
        // Outbound DM rows identify us, not the recipient. The reply API resolves the canonical inbound recipient.
        authorId: type === 'dm' ? (row.direction === 'outbound' ? '' : row.senderId || '') : row.authorId || '',
        authorUsername: type === 'dm' ? (row.direction === 'outbound' ? 'Direct message conversation' : row.senderUsername || 'Unknown sender') : row.authorUsername || row.authorName || 'Unknown author',
        authorAvatar: type === 'dm' ? (row.direction === 'outbound' ? null : row.senderAvatar || null) : row.authorAvatar || null,
        meta: { conversationId: row.conversationId, platformCommentId: row.platformCommentId, platformPostId: row.platformPostId,
            mentionType: row.mentionType, rating: row.rating, reviewId: type === 'review' ? row.id : undefined,
            platformReviewId: row.platformReviewId, isReplied: row.isReplied, replyText: row.replyText, reviewUrl: row.reviewUrl },
    };
}
export function inboxParams(filters: InboxFilters, page: number) {
    const params = new URLSearchParams({ type: filters.type, queue: filters.queue, page: String(page) });
    for (const key of ['q', 'socialAccountId', 'platform', 'sentiment'] as const) {
        if (filters[key]) params.set(key, filters[key]);
    }
    return params.toString();
}
export function safeInboxUrl(value?: string | null) {
    if (!value) return undefined;
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined; }
    catch { return undefined; }
}
/** Also reject logical failures returned with an HTTP 200. */
export async function inboxRequest<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    const data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.error || `Request failed (${res.status})`);
    return data as T;
}
export const jsonBody = (body: unknown, method = 'PATCH'): RequestInit => ({
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
