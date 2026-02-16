/**
 * Competitor Sync API
 * Refreshes competitor metrics and fetches recent posts via Business Discovery API.
 *
 * Why: Replaces the old HTML scraper approach with the official Instagram
 * Graph API Business Discovery endpoint for reliable data fetching.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
    getBusinessDiscoveryProfile,
    getBusinessDiscoveryMedia,
} from '@/lib/platform-api/instagram/business-discovery';
import { logger } from '@/lib/logger';

/**
 * POST /api/competitors/sync?id={competitorId}
 * Refreshes competitor data via Business Discovery API.
 */
export async function POST(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;
    const { searchParams } = new URL(request.url);
    const competitorId = searchParams.get('id');

    if (!competitorId) {
        return NextResponse.json({ error: 'Competitor ID is required' }, { status: 400 });
    }

    // Verify competitor belongs to organization
    const competitor = await db.competitor.findFirst({
        where: { id: competitorId, organizationId }
    });

    if (!competitor) {
        return NextResponse.json({ error: 'Competitor not found' }, { status: 404 });
    }

    // Currently only Instagram is supported via Business Discovery
    if (competitor.platform !== 'INSTAGRAM') {
        return NextResponse.json({
            error: 'Only Instagram competitors can be synced currently.',
            synced: false
        }, { status: 400 });
    }

    // Find an active Instagram account in the org for API access
    const igAccount = await db.socialAccount.findFirst({
        where: { organizationId, platform: 'INSTAGRAM', isActive: true },
        select: { id: true, platformId: true },
    });

    if (!igAccount) {
        return NextResponse.json({
            error: 'No connected Instagram Business account. Connect one in Settings.',
            synced: false
        }, { status: 400 });
    }

    // Ensure valid token
    const { ensureValidToken } = await import('@/lib/services/token-service');
    const tokenResult = await ensureValidToken(igAccount.id);

    if (!tokenResult.success || !tokenResult.accessToken) {
        return NextResponse.json({
            error: 'Instagram token expired. Please reconnect your account in Settings.',
            synced: false
        }, { status: 401 });
    }

    const accessToken = tokenResult.accessToken;
    logger.info({ competitorId, username: competitor.username }, 'Syncing competitor via Business Discovery');

    // Fetch profile
    const profileResult = await getBusinessDiscoveryProfile(
        accessToken,
        igAccount.platformId,
        competitor.username
    );

    if (!profileResult.success || !profileResult.data) {
        logger.warn({ username: competitor.username, error: profileResult.error }, 'Competitor sync profile failed');
        return NextResponse.json({
            error: profileResult.error || 'Failed to fetch competitor data.',
            synced: false
        }, { status: 502 });
    }

    const profile = profileResult.data;

    // Calculate follower growth (percentage)
    const previousFollowers = competitor.followers;
    const followerGrowth = previousFollowers > 0
        ? Math.round(((profile.followers - previousFollowers) / previousFollowers) * 10000) / 100
        : 0;

    // Fetch recent posts for engagement metrics
    const mediaResult = await getBusinessDiscoveryMedia(
        accessToken,
        igAccount.platformId,
        competitor.username,
        12
    );

    const posts = mediaResult.success && mediaResult.data ? mediaResult.data : [];

    // Calculate average engagement and posts per week
    let totalEngagement = 0;
    let validPostCount = 0;

    for (const post of posts) {
        if (post.likeCount > 0 || post.commentsCount > 0) {
            totalEngagement += post.likeCount + post.commentsCount;
            validPostCount++;
        }
    }

    const avgEngagement = profile.followers > 0 && validPostCount > 0
        ? ((totalEngagement / validPostCount) / profile.followers) * 100
        : 0;

    // Why: Estimate posts/week from the date range of scraped posts.
    // If we have at least 2 posts with timestamps, calculate the frequency.
    let postsPerWeek = 0;
    if (posts.length >= 2) {
        const newest = posts[0].timestamp.getTime();
        const oldest = posts[posts.length - 1].timestamp.getTime();
        const daySpan = Math.max((newest - oldest) / (1000 * 60 * 60 * 24), 1);
        postsPerWeek = Math.round((posts.length / daySpan) * 7 * 10) / 10;
    } else if (posts.length === 1) {
        postsPerWeek = 1;
    }

    // Update competitor record
    await db.competitor.update({
        where: { id: competitorId },
        data: {
            displayName: profile.displayName || competitor.displayName,
            avatar: profile.avatarUrl || competitor.avatar,
            followers: profile.followers,
            followerGrowth,
            avgEngagement: Math.round(avgEngagement * 100) / 100,
            postsPerWeek,
            isVerified: profile.isVerified,
            lastSyncedAt: new Date()
        }
    });

    // Store/update posts in CompetitorPost table
    let newPostsCount = 0;
    for (const post of posts) {
        if (!post.id) continue;

        try {
            await db.competitorPost.upsert({
                where: {
                    competitorId_platformId: {
                        competitorId,
                        platformId: post.id
                    }
                },
                create: {
                    competitorId,
                    platformId: post.id,
                    caption: post.caption.slice(0, 2000),
                    mediaType: post.mediaType === 'VIDEO' ? 'video'
                        : post.mediaType === 'CAROUSEL_ALBUM' ? 'carousel'
                            : 'image',
                    likes: post.likeCount,
                    comments: post.commentsCount,
                    engagement: post.likeCount + post.commentsCount,
                    postedAt: post.timestamp
                },
                update: {
                    likes: post.likeCount,
                    comments: post.commentsCount,
                    engagement: post.likeCount + post.commentsCount
                }
            });
            newPostsCount++;
        } catch {
            logger.debug({ postId: post.id }, 'Failed to upsert competitor post');
        }
    }

    logger.info({
        username: competitor.username,
        followers: profile.followers,
        postsStored: newPostsCount,
    }, 'Competitor synced via Business Discovery');

    return NextResponse.json({
        synced: true,
        followers: profile.followers,
        followerGrowth,
        avgEngagement: Math.round(avgEngagement * 100) / 100,
        postsPerWeek,
        postsSynced: newPostsCount,
        lastSyncedAt: new Date().toISOString()
    });
}
