/**
 * Comments Sync Engine Service
 * Real-time synchronization of comments and mentions from social platforms
 * 
 * Note: Uses in-memory storage. For production, add Comment model to schema.
 */

import { db } from '@/lib/db';
import { createWorkerLogger } from '@/lib/logger';
import { Platform } from '@/generated/prisma/client';

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

// Run cleanup every 5 minutes
setInterval(evictOldComments, 5 * 60 * 1000);

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
        const url = `https://graph.facebook.com/v24.0/${mediaId}/comments`;
        const params = new URLSearchParams({
            access_token: accessToken,
            fields: 'id,text,timestamp,from{id,username,profile_picture_url}',
        });

        const response = await fetch(`${url}?${params}`);
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
            createdAt: new Date(comment.timestamp as string),
            isMention: String(comment.text || '').includes('@'),
            isRead: false,
        }));
    } catch (error) {
        log.error(`Instagram comments fetch failed: ${error}`);
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
        const response = await fetch('https://open.tiktokapis.com/v2/comment/list/', {
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
            isMention: String(comment.text || '').includes('@'),
            isRead: false,
        }));
    } catch (error) {
        log.error(`TikTok comments fetch failed: ${error}`);
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
        if (platform === Platform.INSTAGRAM || platform === Platform.FACEBOOK) {
            comments = await fetchInstagramComments(accessToken, platformPostId, postId);
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

        log.info(`Synced ${comments.length} comments for post ${postId}`);
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(msg);
        log.error(`Comment sync failed: ${msg}`);
    }

    return result;
}

/**
 * Sync comments for all published posts in a workspace
 */
export async function syncWorkspaceComments(organizationId: string): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    // Why: Query published posts with platformPostId directly
    const posts = await db.post.findMany({
        where: {
            organizationId,
            status: 'PUBLISHED',
            platformPostId: { not: null },
            platform: { not: null },
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

    for (const post of posts) {
        if (!post.socialAccount?.accessToken || !post.platformPostId) continue;

        // Decrypt/refresh token before API calls
        const { ensureValidToken } = await import('@/lib/services/token-service');
        const tokenResult = await ensureValidToken(post.socialAccount.id);
        const accessToken = tokenResult.success && tokenResult.accessToken
            ? tokenResult.accessToken
            : post.socialAccount.accessToken; // fallback to raw if service fails

        const result = await syncPostComments(
            post.id,
            post.socialAccount.platform,
            post.platformPostId,
            accessToken
        );

        results.push(result);

        // Rate limiting
        await new Promise((r) => setTimeout(r, 200));
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
