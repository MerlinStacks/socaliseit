/**
 * Competitor Sync API
 * Refreshes competitor metrics and fetches recent posts
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { scrapeInstagramProfile, scrapeInstagramPosts } from '@/lib/scrapers/instagram-scraper';
import { logger } from '@/lib/logger';
import { getRedisConnection } from '@/lib/bullmq/connection';

const SYNC_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes between syncs

/**
 * POST /api/competitors/sync?id={competitorId}
 * Refreshes competitor data by re-scraping their profile and posts
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

    // Check cooldown
    const redis = getRedisConnection();
    const cooldownKey = `competitor_sync:${competitorId}`;
    const lastSync = await redis.get(cooldownKey);

    if (lastSync) {
        const elapsed = Date.now() - parseInt(lastSync, 10);
        if (elapsed < SYNC_COOLDOWN_MS) {
            const remainingMs = SYNC_COOLDOWN_MS - elapsed;
            return NextResponse.json(
                { error: `Please wait ${Math.ceil(remainingMs / 60000)} minutes before syncing again` },
                { status: 429, headers: { 'Retry-After': String(Math.ceil(remainingMs / 1000)) } }
            );
        }
    }

    // Set cooldown
    await redis.set(cooldownKey, String(Date.now()), 'EX', Math.ceil(SYNC_COOLDOWN_MS / 1000));

    // Currently only Instagram is supported
    if (competitor.platform !== 'INSTAGRAM') {
        return NextResponse.json({
            error: 'Only Instagram competitors can be synced currently',
            synced: false
        }, { status: 400 });
    }

    logger.info(`[CompetitorSync] Syncing @${competitor.username}`);

    // Scrape profile for updated metrics
    const profile = await scrapeInstagramProfile(competitor.username);

    if (!profile) {
        logger.warn(`[CompetitorSync] Failed to scrape profile for @${competitor.username}`);
        return NextResponse.json({
            error: 'Failed to fetch competitor data. Profile may be private or unavailable.',
            synced: false
        }, { status: 502 });
    }

    // Calculate follower growth
    const previousFollowers = competitor.followers;
    const followerGrowth = profile.followers - previousFollowers;

    // Scrape recent posts
    const scrapedPosts = await scrapeInstagramPosts(competitor.username, 12);

    // Calculate average engagement and posts per week
    let totalEngagement = 0;
    let validPostCount = 0;

    for (const post of scrapedPosts) {
        if (post.likes > 0 || post.comments > 0) {
            totalEngagement += post.likes + post.comments;
            validPostCount++;
        }
    }

    const avgEngagement = profile.followers > 0 && validPostCount > 0
        ? ((totalEngagement / validPostCount) / profile.followers) * 100
        : 0;

    // Estimate posts per week from recent posts
    const postsPerWeek = validPostCount > 0 ? Math.min(validPostCount, 7) : 0;

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
    for (const post of scrapedPosts) {
        if (!post.shortcode) continue;

        try {
            await db.competitorPost.upsert({
                where: {
                    competitorId_platformId: {
                        competitorId,
                        platformId: post.shortcode
                    }
                },
                create: {
                    competitorId,
                    platformId: post.shortcode,
                    caption: post.caption.slice(0, 2000), // Truncate long captions
                    mediaType: post.mediaType,
                    likes: post.likes,
                    comments: post.comments,
                    engagement: post.likes + post.comments,
                    postedAt: post.postedAt
                },
                update: {
                    likes: post.likes,
                    comments: post.comments,
                    engagement: post.likes + post.comments
                }
            });
            newPostsCount++;
        } catch (err) {
            logger.debug(`[CompetitorSync] Failed to upsert post ${post.shortcode}`);
        }
    }

    logger.info(`[CompetitorSync] Synced @${competitor.username}: ${profile.followers} followers, ${newPostsCount} posts`);

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
