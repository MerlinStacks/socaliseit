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
    postPlatformId: string;
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

// In-memory stores
const commentsStore = new Map<string, SocialComment[]>();
const mentionsStore: SocialComment[] = [];

// ============================================================================
// Platform Fetchers
// ============================================================================

/**
 * Fetch comments from Instagram Graph API
 */
async function fetchInstagramComments(
    accessToken: string,
    mediaId: string,
    postPlatformId: string
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
            postPlatformId,
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
    postPlatformId: string
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
            postPlatformId,
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
    postPlatformId: string,
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
            comments = await fetchInstagramComments(accessToken, platformPostId, postPlatformId);
        } else if (platform === Platform.TIKTOK) {
            comments = await fetchTikTokComments(accessToken, platformPostId, postPlatformId);
        } else {
            result.errors.push(`Unsupported platform: ${platform}`);
            return result;
        }

        // Store comments
        const existingIds = new Set((commentsStore.get(postPlatformId) || []).map((c) => c.id));
        const newComments = comments.filter((c) => !existingIds.has(c.id));

        commentsStore.set(postPlatformId, [
            ...(commentsStore.get(postPlatformId) || []),
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

        log.info(`Synced ${comments.length} comments for post ${postPlatformId}`);
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
export async function syncWorkspaceComments(workspaceId: string): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    // Query PostPlatform through workspace relation
    const postPlatforms = await db.postPlatform.findMany({
        where: {
            post: { workspaceId },
            status: 'PUBLISHED',
            platformPostId: { not: null },
        },
        include: {
            socialAccount: {
                select: { accessToken: true, platform: true },
            },
        },
        take: 100,
        orderBy: { publishedAt: 'desc' },
    });

    for (const pp of postPlatforms) {
        if (!pp.socialAccount?.accessToken || !pp.platformPostId) continue;

        const result = await syncPostComments(
            pp.id,
            pp.socialAccount.platform,
            pp.platformPostId,
            pp.socialAccount.accessToken
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
 * Get comments for a post platform
 */
export function getPostComments(postPlatformId: string): SocialComment[] {
    return commentsStore.get(postPlatformId) || [];
}
