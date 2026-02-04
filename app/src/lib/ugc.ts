/**
 * UGC (User Generated Content) Management
 * Collect, curate, and leverage user-generated content
 */

import { logger } from './logger';
import { db } from './db';
import { searchInstagramHashtagWithMedia } from './platform-api/instagram-api';
import type { HashtagMedia } from './platform-api/types';

export interface UGCPost {
    id: string;
    organizationId: string;
    platform: string;
    externalId: string;
    postUrl: string;
    authorUsername: string;
    authorDisplayName: string;
    authorProfileUrl: string;
    authorFollowers: number;
    caption: string;
    mediaUrls: string[];
    mediaType: 'image' | 'video' | 'carousel';
    engagement: {
        likes: number;
        comments: number;
        shares: number;
    };
    publishedAt: Date;
    discoveredAt: Date;
    status: 'pending' | 'requested' | 'approved' | 'denied' | 'used';
    permissionRequest?: PermissionRequest;
    notes: string;
    tags: string[];
}

export interface PermissionRequest {
    id: string;
    ugcPostId: string;
    method: 'dm' | 'comment' | 'email';
    sentAt: Date;
    sentMessage: string;
    responseAt?: Date;
    response?: 'approved' | 'denied' | 'no_response';
    responseMessage?: string;
}

export interface UGCSearchQuery {
    hashtags?: string[];
    mentions?: string[];
    keywords?: string[];
    platforms?: string[];
    minFollowers?: number;
    minEngagement?: number;
    dateRange?: { start: Date; end: Date };
}

// DM templates for permission requests
export const PERMISSION_TEMPLATES = {
    formal: `Hi {{author_name}}! 👋

We love your post featuring {{product/brand}}! Would you be open to us sharing it on our page? We'll give you full credit of course!

Just reply "yes" if that's okay with you. 💕

Thanks!
{{brand_name}}`,

    casual: `Hey {{author_name}}! 

OMG we're obsessed with this post! 😍 Can we repost it? Full credit to you!

Reply with a 👍 if you're cool with it!`,

    professional: `Hello {{author_name}},

Thank you for creating such wonderful content featuring our brand. We would be honored to share your post with our community.

With your permission, we would:
- Repost with full attribution
- Tag your account
- Credit you as the creator

Please reply to confirm your consent.

Best regards,
{{brand_name}} Team`,
};

/**
 * Convert HashtagMedia from Instagram API to UGCPost format
 */
function hashtagMediaToUGCPost(
    media: HashtagMedia,
    organizationId: string,
    platform: string = 'instagram'
): UGCPost {
    // Map Instagram media types to our types
    const mediaTypeMap: Record<string, 'image' | 'video' | 'carousel'> = {
        'IMAGE': 'image',
        'VIDEO': 'video',
        'CAROUSEL_ALBUM': 'carousel',
    };

    return {
        id: `ugc_${media.id}`,
        organizationId,
        platform,
        externalId: media.id,
        postUrl: media.permalink,
        authorUsername: media.ownerUsername || 'unknown',
        authorDisplayName: media.ownerUsername || 'Unknown',
        authorProfileUrl: `https://instagram.com/${media.ownerUsername || 'unknown'}`,
        authorFollowers: 0, // Not available from hashtag media endpoint
        caption: media.caption || '',
        mediaUrls: media.mediaUrl ? [media.mediaUrl] : (media.thumbnailUrl ? [media.thumbnailUrl] : []),
        mediaType: mediaTypeMap[media.mediaType] || 'image',
        engagement: {
            likes: media.likeCount,
            comments: media.commentsCount,
            shares: 0, // Not available from hashtag endpoint
        },
        publishedAt: media.timestamp,
        discoveredAt: new Date(),
        status: 'pending',
        notes: '',
        tags: [],
    };
}

/**
 * Search for UGC on platforms using real API calls
 * 
 * Why: Discover user-generated content by searching hashtags on connected platforms.
 */
export async function searchUGC(
    organizationId: string,
    query: UGCSearchQuery
): Promise<UGCPost[]> {
    const results: UGCPost[] = [];

    try {
        // Get connected Instagram accounts for this workspace
        const instagramAccounts = await db.socialAccount.findMany({
            where: {
                organizationId,
                platform: 'INSTAGRAM',
                isActive: true,
            },
        });

        if (instagramAccounts.length === 0) {
            logger.debug({ organizationId }, 'No Instagram accounts connected for UGC search');
            return [];
        }

        // Use the first connected Instagram account
        const account = instagramAccounts[0];

        // Search hashtags if provided
        if (query.hashtags && query.hashtags.length > 0) {
            for (const hashtag of query.hashtags) {
                try {
                    logger.debug({ hashtag, organizationId }, 'Searching Instagram hashtag for UGC');

                    const result = await searchInstagramHashtagWithMedia(
                        account.accessToken,
                        account.platformId,
                        hashtag,
                        25 // Limit per hashtag
                    );

                    if (result.success && result.data) {
                        // Combine top and recent media, dedupe by ID
                        const allMedia = [...result.data.topMedia, ...result.data.recentMedia];
                        const seenIds = new Set<string>();

                        for (const media of allMedia) {
                            if (!seenIds.has(media.id)) {
                                seenIds.add(media.id);
                                const ugcPost = hashtagMediaToUGCPost(media, organizationId, 'instagram');
                                ugcPost.tags.push(hashtag.replace(/^#/, ''));
                                results.push(ugcPost);
                            }
                        }
                    } else {
                        logger.warn({ hashtag, error: result.error }, 'Failed to search hashtag');
                    }
                } catch (error) {
                    logger.error({ hashtag, error }, 'Error searching hashtag for UGC');
                }
            }
        }

        // Apply engagement filter if specified
        if (query.minEngagement && query.minEngagement > 0) {
            return results.filter(post => {
                const totalEngagement = post.engagement.likes + post.engagement.comments;
                return totalEngagement >= query.minEngagement!;
            });
        }

        // Apply date range filter if specified
        if (query.dateRange) {
            return results.filter(post => {
                return post.publishedAt >= query.dateRange!.start &&
                    post.publishedAt <= query.dateRange!.end;
            });
        }

        return results;

    } catch (error) {
        logger.error({ organizationId, error }, 'Error in searchUGC');
        return [];
    }
}

/**
 * Send permission request
 */
export async function requestPermission(
    ugcPostId: string,
    method: 'dm' | 'comment' | 'email',
    message: string
): Promise<PermissionRequest> {
    // In production, send DM/comment via platform API

    const request: PermissionRequest = {
        id: `perm_${Date.now()}`,
        ugcPostId,
        method,
        sentAt: new Date(),
        sentMessage: message,
    };

    // TODO: Implement actual platform messaging API\n    logger.debug({ ugcPostId, method, message }, 'Sending UGC message');

    return request;
}

/**
 * Update permission status
 */
export async function updatePermissionStatus(
    ugcPostId: string,
    response: 'approved' | 'denied',
    _responseMessage?: string
): Promise<UGCPost> {
    // In production, update database

    return {
        id: ugcPostId,
        status: response === 'approved' ? 'approved' : 'denied',
    } as UGCPost;
}

/**
 * Add UGC to library for reposting
 */
export async function addToUGCLibrary(
    _ugcPost: UGCPost,
    _options: {
        downloadMedia: boolean;
        scheduleRepost?: Date;
        platforms?: string[];
    }
): Promise<{ success: boolean; mediaIds?: string[] }> {
    // In production:
    // 1. Download media to your storage
    // 2. Add to media library with UGC tag
    // 3. Optionally schedule repost

    return { success: true, mediaIds: ['media_ugc_1'] };
}

/**
 * Get UGC performance comparison
 */
export async function getUGCPerformance(
    _organizationId: string,
    _dateRange: { start: Date; end: Date }
): Promise<{
    ugcPosts: number;
    brandedPosts: number;
    ugcAvgEngagement: number;
    brandedAvgEngagement: number;
    ugcAvgReach: number;
    brandedAvgReach: number;
    recommendation: string;
}> {
    // Mock data
    return {
        ugcPosts: 12,
        brandedPosts: 45,
        ugcAvgEngagement: 6.8,
        brandedAvgEngagement: 4.2,
        ugcAvgReach: 15000,
        brandedAvgReach: 9500,
        recommendation: 'UGC posts perform 62% better. Aim for 30% UGC content mix.',
    };
}

/**
 * Set up automated UGC monitoring
 */
export async function setupUGCMonitoring(
    _organizationId: string,
    _config: {
        hashtags: string[];
        mentions: string[];
        platforms: string[];
        minFollowers: number;
        autoRequest: boolean;
        notifyOnNew: boolean;
    }
): Promise<{ id: string }> {
    // In production, set up background job to periodically search

    return { id: `monitor_${Date.now()}` };
}
