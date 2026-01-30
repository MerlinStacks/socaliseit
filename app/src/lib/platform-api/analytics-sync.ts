/**
 * Analytics Sync Engine
 * Orchestrates fetching and storing analytics data from all platforms
 */

import { db } from '@/lib/db';
import { Platform } from '@prisma/client';
import { getInstagramAnalytics, getInstagramPostAnalytics } from './instagram-api';
import { getFacebookPageAnalytics, getFacebookPostAnalytics } from './facebook-api';
import { getTikTokAnalytics, getTikTokVideoAnalytics } from './tiktok-api';
import { getYouTubeChannelAnalytics, getYouTubeVideoMetrics } from './youtube-api';
import { getPinterestUserAnalytics, getPinterestPinAnalytics } from './pinterest-api';
import { AccountMetrics, PostMetrics, ApiResponse } from './types';

/**
 * Sync Account-Level Analytics for a Workspace
 */
export async function syncWorkspaceAnalytics(workspaceId: string) {
    const accounts = await db.socialAccount.findMany({
        where: { workspaceId, isActive: true }
    });

    const results = await Promise.all(
        accounts.map(account => syncAccountAnalytics(account.id))
    );

    return results;
}

/**
 * Sync Single Account Analytics
 */
export async function syncAccountAnalytics(accountId: string) {
    const account = await db.socialAccount.findUnique({
        where: { id: accountId }
    });

    if (!account) return { success: false, error: 'Account not found' };

    try {
        let metrics: ApiResponse<AccountMetrics> = { success: false, error: 'Unsupported platform' };

        switch (account.platform) {
            case 'INSTAGRAM':
                metrics = await getInstagramAnalytics(account.accessToken, account.platformId);
                break;
            case 'FACEBOOK':
                metrics = await getFacebookPageAnalytics(account.accessToken, account.platformId);
                break;
            case 'TIKTOK':
                metrics = await getTikTokAnalytics(account.accessToken);
                break;
            case 'YOUTUBE':
                metrics = await getYouTubeChannelAnalytics(account.accessToken, account.platformId);
                break;
            case 'PINTEREST':
                metrics = await getPinterestUserAnalytics(account.accessToken);
                break;
            // TODO: Add Twitter/LinkedIn/Bluesky
        }

        if (metrics.success && metrics.data) {
            const data = metrics.data;
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            await db.platformAnalytics.upsert({
                where: {
                    socialAccountId_date: {
                        socialAccountId: account.id,
                        date: today
                    }
                },
                update: {
                    followers: data.followers,
                    // followersChange: Calculate diff if needed, or API provides it
                    following: data.following,
                    impressions: data.impressions,
                    reach: data.reach,
                    engagementRate: data.engagementRate,
                    profileViews: data.profileViews,
                    websiteClicks: data.websiteClicks,
                    emailClicks: data.emailClicks,
                    platformMetrics: data.platformMetrics as any,
                    syncedAt: new Date(),
                },
                create: {
                    workspaceId: account.workspaceId,
                    socialAccountId: account.id,
                    date: today,
                    followers: data.followers,
                    following: data.following,
                    impressions: data.impressions,
                    reach: data.reach,
                    engagementRate: data.engagementRate,
                    profileViews: data.profileViews,
                    websiteClicks: data.websiteClicks,
                    emailClicks: data.emailClicks,
                    platformMetrics: data.platformMetrics as any,
                }
            });

            return { success: true, platform: account.platform };
        } else {
            return { success: false, error: metrics.error, platform: account.platform };
        }

    } catch (error: any) {
        return { success: false, error: error.message, platform: account.platform };
    }
}

/**
 * Sync Analytics for Recent Posts (Last 30 days)
 */
export async function syncRecentPostsAnalytics(workspaceId: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const posts = await db.postPlatform.findMany({
        where: {
            socialAccount: { workspaceId },
            status: 'PUBLISHED',
            publishedAt: { gte: thirtyDaysAgo },
            platformPostId: { not: null }
        },
        include: { socialAccount: true }
    });

    // Group by account to optimize bulk fetching where possible (e.g. TikTok)
    const updates = await Promise.all(posts.map(async (post) => {
        if (!post.platformPostId) return null;

        const account = post.socialAccount;
        let metrics: ApiResponse<PostMetrics> = { success: false };

        try {
            switch (account.platform) {
                case 'INSTAGRAM':
                    metrics = await getInstagramPostAnalytics(account.accessToken, post.platformPostId);
                    break;
                case 'FACEBOOK':
                    metrics = await getFacebookPostAnalytics(account.accessToken, post.platformPostId);
                    break;
                case 'YOUTUBE':
                    metrics = await getYouTubeVideoMetrics(account.accessToken, post.platformPostId);
                    break;
                case 'PINTEREST':
                    metrics = await getPinterestPinAnalytics(account.accessToken, post.platformPostId);
                    break;
                case 'TIKTOK':
                    // Optimization: Single video fetch for now, bulk later
                    const vidMetrics = await getTikTokVideoAnalytics(account.accessToken, [post.platformPostId]);
                    if (vidMetrics.success && vidMetrics.data && vidMetrics.data.length > 0) {
                        metrics = { success: true, data: vidMetrics.data[0] };
                    } else {
                        metrics = { success: false, error: vidMetrics.error };
                    }
                    break;
            }

            if (metrics.success && metrics.data) {
                const data = metrics.data;
                await db.postAnalytics.upsert({
                    where: { postPlatformId: post.id },
                    update: {
                        impressions: data.impressions,
                        reach: data.reach,
                        likes: data.likes,
                        comments: data.comments,
                        shares: data.shares,
                        saves: data.saves,
                        clicks: data.clicks,
                        videoViews: data.videoViews,
                        engagementRate: data.engagementRate,
                        platformMetrics: data.platformMetrics as any,
                        syncedAt: new Date(),
                    },
                    create: {
                        postPlatformId: post.id,
                        impressions: data.impressions,
                        reach: data.reach,
                        likes: data.likes,
                        comments: data.comments,
                        shares: data.shares,
                        saves: data.saves,
                        clicks: data.clicks,
                        videoViews: data.videoViews,
                        engagementRate: data.engagementRate,
                        platformMetrics: data.platformMetrics as any,
                    }
                });
                return { id: post.id, success: true };
            }
        } catch (e) {
            console.error(`Failed to sync post ${post.id}`, e);
        }
        return { id: post.id, success: false };
    }));

    return updates;
}
