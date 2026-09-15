/** JSON shapes returned by the listening endpoints. */
export interface Monitor {
    id: string; name: string; keywords: string[]; excludedTerms: string[];
    platforms: string[]; isActive: boolean; lastSyncedAt: string | null; _count: { items: number };
}
export interface Source {
    id: string; name: string; url: string; sourceType: string; isActive: boolean;
    lastCrawledAt: string | null; lastError: string | null;
}
export interface ListeningItem {
    id: string; platform: string; sourceType: string; externalUrl: string | null;
    authorName: string | null; content: string; mediaUrl: string | null;
    sentiment: string; matchedKeywords: string[]; isRead: boolean; occurredAt: string;
    monitor: { name: string };
}
export interface ListeningData {
    items: ListeningItem[]; monitors: Monitor[]; crawlerSources: Source[]; platforms: string[];
    totalCount: number; unreadCount: number; page: number; pageSize: number; totalPages: number;
    sentiment: Record<string, number>;
}
export const PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'META', 'TIKTOK', 'YOUTUBE', 'PINTEREST', 'GOOGLE_BUSINESS', 'LINKEDIN', 'BLUESKY', 'THREADS', 'MANUAL'];
export const SENTIMENTS = ['positive', 'neutral', 'negative', 'question'];
export const SOURCE_TYPES = ['mention', 'comment', 'review', 'dm', 'public_post', 'crawler'];
export type Action = (url: string, method: string, body?: unknown) => Promise<boolean>;

/** Keep validation and stage errors visible even on non-2xx responses. */
export async function listeningRequest<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        const details = payload?.issues?.map((issue: { message: string }) => issue.message).join('; ')
            || payload?.errors?.map((error: { stage: string; message: string }) => `${error.stage}: ${error.message}`).join('; ');
        throw new Error([payload?.error || `Request failed (${response.status})`, details].filter(Boolean).join(': '));
    }
    if (!payload) throw new Error('The server returned an empty response. Please retry.');
    return payload as T;
}
