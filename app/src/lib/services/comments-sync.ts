/**
 * Comments Sync Engine Service
 * Real-time synchronization of comments and mentions from social platforms
 *
 * Note: Uses in-memory storage. For production, add Comment model to schema.
 *
 * Why (BUG-42): Removed encrypted token fallback — now skips post if token refresh fails.
 * Why (BUG-43): Replaced module-level setInterval with lazy init to prevent interval leaks.
 * Why (BUG-47): Facebook comments now route to fetchFacebookComments, not Instagram endpoint.
 * Why (BUG-55): Added null check on comment.timestamp to prevent Invalid Date.
 * Why (BUG-57): Replaced naive `@` detection with proper @username regex.
 */

import { db } from '@/lib/db';
import { createWorkerLogger } from '@/lib/logger';
import { Platform } from '@/generated/prisma/client';
import { ensureValidToken } from '@/lib/services/token-service';
import { GRAPH_API_URL } from '@/lib/platform-api/constants';

const log = createWorkerLogger('CommentsSyncEngine');

// ============================================================================
// Types
// ============================================================================

export interface SocialComment {
    id: string;
    platformId: string;
    platform: Platform;
    postId: string;
    authorId: string;
    authorName: string;
    authorAvatar?: string;
    text: string;
    createdAt: Date;
    likes?: number;
    isMention?: boolean;
    isRead?: boolean;
}

export interface SyncResult {
    platform: string;
    commentsAdded: number;
    mentionsFound: number;
    errors: string[];
}

// In-memory stores with size limits
const commentsStore = new Map<string, SocialComment[]>();
const mentionsStore: SocialComment[] = [];
const MAX_POSTS_CACHED = 100;
const MAX_MENTIONS_STORED = 500;
const COMMENTS_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Why (BUG-57): Proper @mention regex that matches @username patterns,
 * not arbitrary @ signs like email addresses.
 */
// Why (BUG-FIX): Previous regex matched @domain in email addresses.
// Now requires word boundary or whitespace before @, preventing false matches.
const MENTION_REGEX = /(?:^|(?<=\s))@[\w.]{1,30}(?=\s|$|[.!?,;:])/;

/**
 * Evict old comments to prevent unbounded memory growth.
 * Why: Without cleanup, stores grow indefinitely causing OOM.
 */
function evictOldComments(): void {
    const now = Date.now();

    // Evict old post comments
    for (const [key, comments] of commentsStore.entries()) {
        const freshComments = comments.filter(
            c => now - c.createdAt.getTime() < COMMENTS_TTL_MS
        );
        if (freshComments.length === 0) {
            commentsStore.delete(key);
        } else {
            commentsStore.set(key, freshComments);
        }
    }

    // Trim mentions if over limit (keep newest)
    if (mentionsStore.length > MAX_MENTIONS_STORED) {
        mentionsStore.splice(0, mentionsStore.length - MAX_MENTIONS_STORED);
    }

    // Trim commentsStore keys if over limit (remove oldest posts)
    if (commentsStore.size > MAX_POSTS_CACHED) {
        const keys = Array.from(commentsStore.keys());
        const toRemove = keys.slice(0, commentsStore.size - MAX_POSTS_CACHED);
        for (const key of toRemove) {
            commentsStore.delete(key);
        }
    }
}

/**
 * Why (BUG-43): Lazy-initialised cleanup interval. The caller (worker) should
 * call `startEvictionTimer()` on boot and `stopEvictionTimer()` on shutdown
 * instead of leaking a module-level setInterval.
 */
let evictionInterval: ReturnType<typeof setInterval> | null = null;

/** Start the eviction timer. Safe to call multiple times — only one interval runs. */
export function startEvictionTimer(): void {
    if (!evictionInterval) {
        evictionInterval = setInterval(evictOldComments, 5 * 60 * 1000);
    }
}

/** Stop the eviction timer and release the reference. */
export function stopEvictionTimer(): void {
    if (evictionInterval) {
        clearInterval(evictionInterval);
        evictionInterval = null;
    }
}

// ============================================================================
// Platform Fetchers
// ============================================================================

/**
 * Fetch comments from Instagram Graph API
 */
async function fetchInstagramComments(
    accessToken: string,
    mediaId: string,
    postId: string
): Promise<SocialComment[]> {
    try {
        const url = `${GRAPH_API_URL}/${mediaId}/comments`;

        // Why: Bearer header avoids token leakage into server logs and proxy caches.
        const response = await fetch(
            `${url}?fields=id,text,timestamp,from{id,username,profile_picture_url}`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        if (!response.ok) {
            throw new Error(`Instagram API error: ${response.status}`);
        }

        const data = await response.json();

        return (data.data || []).map((comment: Record<string, unknown>) => ({
            id: `ig_${comment.id}`,
            platformId: String(comment.id),
            platform: Platform.INSTAGRAM,
            postId,
            authorId: (comment.from as Record<string, string>)?.id || '',
            authorName: (comment.from as Record<string, string>)?.username || 'Unknown',
            authorAvatar: (comment.from as Record<string, string>)?.profile_picture_url,
            text: String(comment.text || ''),
            // Why (BUG-55): Guard against missing timestamp
            createdAt: comment.timestamp ? new Date(comment.timestamp as string) : new Date(),
            // Why (BUG-57): Use regex for proper @mention detection
            isMention: MENTION_REGEX.test(String(comment.text || '')),
            isRead: false,
        }));
    } catch (error) {
        log.error({ platform: 'instagram', mediaId, error }, 'Instagram comments fetch failed');
        return [];
    }
}

/**
 * Fetch comments from Facebook Graph API
 *
 * Why (BUG-47): This was previously missing — Facebook was incorrectly
 * routed to the Instagram fetcher. Facebook Page comments use the same
 * Graph API domain but with page-specific fields.
 */
async function fetchFacebookComments(
    accessToken: string,
    postId: string,
    internalPostId: string
): Promise<SocialComment[]> {
    try {
        const url = `${GRAPH_API_URL}/${postId}/comments`;

        // Why: Bearer header avoids token leakage into server logs and proxy caches.
        const response = await fetch(
            `${url}?fields=id,message,created_time,from{id,name,picture{url}}`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        if (!response.ok) {
            throw new Error(`Facebook API error: ${response.status}`);
        }

        const data = await response.json();

        return (data.data || []).map((comment: Record<string, unknown>) => ({
            id: `fb_${comment.id}`,
            platformId: String(comment.id),
            platform: Platform.FACEBOOK,
            postId: internalPostId,
            authorId: (comment.from as Record<string, string>)?.id || '',
            authorName: (comment.from as Record<string, string>)?.name || 'Unknown',
            authorAvatar: ((comment.from as Record<string, unknown>)?.picture as { data?: { url?: string } })?.data?.url,
            text: String(comment.message || ''),
            createdAt: comment.created_time ? new Date(comment.created_time as string) : new Date(),
            isMention: MENTION_REGEX.test(String(comment.message || '')),
            isRead: false,
        }));
    } catch (error) {
        log.error({ platform: 'facebook', postId, error }, 'Facebook comments fetch failed');
        return [];
    }
}

/**
 * Fetch comments from TikTok API
 */
async function fetchTikTokComments(
    accessToken: string,
    videoId: string,
    postId: string
): Promise<SocialComment[]> {
    try {
        const response = await fetch('https://open.tiktokapis.com/v2/video/comment/list/', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                video_id: videoId,
                max_count: 50,
            }),
        });

        if (!response.ok) {
            // Why (BUG-FIX): TikTok occasionally returns HTML error/captcha pages
            // instead of JSON. Read as text to avoid JSON parse errors.
            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                const body = await response.text();
                throw new Error(`TikTok API returned ${response.status} (${contentType.split(';')[0] || 'unknown'}): ${body.substring(0, 120)}`);
            }
            throw new Error(`TikTok API error: ${response.status}`);
        }

        const data = await response.json();

        return (data.data?.comments || []).map((comment: Record<string, unknown>) => ({
            id: `tt_${comment.comment_id}`,
            platformId: String(comment.comment_id),
            platform: Platform.TIKTOK,
            postId,
            authorId: String((comment.user as Record<string, unknown>)?.user_id || ''),
            authorName: (comment.user as Record<string, string>)?.display_name || 'Unknown',
            authorAvatar: (comment.user as Record<string, string>)?.avatar_url,
            text: String(comment.text || ''),
            createdAt: new Date((comment.create_time as number) * 1000),
            likes: comment.like_count as number,
            isMention: MENTION_REGEX.test(String(comment.text || '')),
            isRead: false,
        }));
    } catch (error) {
        log.error({ platform: 'tiktok', videoId, error }, 'TikTok comments fetch failed');
        return [];
    }
}

// ============================================================================
// Sync Functions
// ============================================================================

/**
 * Sync comments for a specific post platform
 */
export async function syncPostComments(
    postId: string,
    platform: Platform,
    platformPostId: string,
    accessToken: string
): Promise<SyncResult> {
    const result: SyncResult = {
        platform: platform.toString(),
        commentsAdded: 0,
        mentionsFound: 0,
        errors: [],
    };

    let comments: SocialComment[] = [];

    try {
        if (platform === Platform.INSTAGRAM) {
            comments = await fetchInstagramComments(accessToken, platformPostId, postId);
        } else if (platform === Platform.FACEBOOK) {
            // Why (BUG-47): Facebook now uses its own fetcher
            comments = await fetchFacebookComments(accessToken, platformPostId, postId);
        } else if (platform === Platform.TIKTOK) {
            comments = await fetchTikTokComments(accessToken, platformPostId, postId);
        } else {
            result.errors.push(`Unsupported platform: ${platform}`);
            return result;
        }

        // Store comments
        const existingIds = new Set((commentsStore.get(postId) || []).map((c) => c.id));
        const newComments = comments.filter((c) => !existingIds.has(c.id));

        commentsStore.set(postId, [
            ...(commentsStore.get(postId) || []),
            ...newComments,
        ]);

        result.commentsAdded = newComments.length;

        // Track mentions
        for (const comment of newComments) {
            if (comment.isMention) {
                mentionsStore.push(comment);
                result.mentionsFound++;
            }
        }

        log.info({ platform, postId, commentsCount: comments.length }, 'Synced comments for post');
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(msg);
        log.error({ platform, postId, error: msg }, 'Comment sync failed');
    }

    return result;
}

/**
 * Sync comments for all published posts in a workspace
 *
 * Why (BUG-42): Removed fallback to raw `post.socialAccount.accessToken`.
 * If token refresh fails, the post is skipped entirely.
 */
export async function syncWorkspaceComments(organizationId: string): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    // Why: Query published posts with platformPostId directly
    const posts = await db.post.findMany({
        where: {
            organizationId,
            status: 'PUBLISHED',
            platform: { not: undefined },
            platformPostId: { not: null },
            socialAccountId: { not: null },
        },
        include: {
            socialAccount: {
                select: { id: true, accessToken: true, platform: true },
            },
        },
        take: 100,
        orderBy: { publishedAt: 'desc' },
    });

    // Why: Batch parallel comment syncing (batch size 5) instead of
    // sequential per-post syncing. For 100 posts the old approach was
    // 100 × 200ms = 20s of delay alone. Batching cuts this to ~4s.
    const BATCH_SIZE = 5;
    for (let i = 0; i < posts.length; i += BATCH_SIZE) {
        const batch = posts.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(
            batch.map(async (post) => {
                if (!post.socialAccount?.accessToken || !post.platformPostId) return null;

                // Why: Token must be decrypted and refreshed before use.
                const tokenResult = await ensureValidToken(post.socialAccount.id);

                // Why (BUG-42): Do NOT fall back to raw encrypted token on failure
                if (!tokenResult.success || !tokenResult.accessToken) {
                    log.error({ accountId: post.socialAccount.id, postId: post.id }, 'Token refresh failed, skipping post');
                    return null;
                }

                return syncPostComments(
                    post.id,
                    post.socialAccount.platform,
                    post.platformPostId,
                    tokenResult.accessToken
                );
            })
        );

        for (const settled of batchResults) {
            if (settled.status === 'fulfilled' && settled.value) {
                results.push(settled.value);
            }
        }

        // Rate limiting between batches
        if (i + BATCH_SIZE < posts.length) {
            await new Promise((r) => setTimeout(r, 200));
        }
    }

    return results;
}

/**
 * Get unread mentions
 */
export function getUnreadMentions(): SocialComment[] {
    return mentionsStore.filter((m) => !m.isRead);
}

/**
 * Mark mentions as read
 */
export function markMentionsAsRead(commentIds: string[]): void {
    const idSet = new Set(commentIds);
    for (const mention of mentionsStore) {
        if (idSet.has(mention.id)) {
            mention.isRead = true;
        }
    }
}

/**
 * Get comments for a post
 */
export function getPostComments(postId: string): SocialComment[] {
    return commentsStore.get(postId) || [];
}
