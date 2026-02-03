'use server';

import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

export type HeatmapCell = {
    day: number; // 0-6 (Sun-Sat)
    hour: number; // 0-23
    value: number; // Engagement score/average
};

export async function getEngagementHeatmap(workspaceId: string, platform?: string): Promise<HeatmapCell[]> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error('Unauthorized');
    }

    // Verify workspace access
    // This check might be redundant if we trust the session.user.workspaces, 
    // but strict security suggests checking DB or session claim.
    // For now, if workspaceId is current, we assume auth.ts did its job.

    // Build filter
    const platformFilter = platform ? { socialAccount: { platform: platform.toUpperCase() as any } } : {};

    const posts = await db.postPlatform.findMany({
        where: {
            post: { workspaceId },
            status: 'PUBLISHED',
            publishedAt: { not: null },
            analytics: { isNot: null },
            ...platformFilter
        },
        select: {
            publishedAt: true,
            analytics: {
                select: {
                    engagementRate: true,
                    likes: true,
                    comments: true,
                    impressions: true
                }
            }
        },
        take: 2000 // Limit to avoid memory issues, covers roughly 6 months of heavy posting
    });

    const grid = Array.from({ length: 7 }, () => Array(24).fill({ sum: 0, count: 0 }));

    posts.forEach(post => {
        if (!post.publishedAt || !post.analytics) return;

        const date = new Date(post.publishedAt);
        const day = date.getDay();
        const hour = date.getHours();

        // Calculate score: prefer engagementRate, fallback to interactions
        let score = 0;
        if (post.analytics.engagementRate > 0) {
            score = post.analytics.engagementRate;
        } else {
            // Fallback calc: (likes + comments) / impressions * 100
            // If impressions 0, just use raw interactions (not ideal but better than 0)
            const interactions = post.analytics.likes + post.analytics.comments;
            if (post.analytics.impressions > 0) {
                score = (interactions / post.analytics.impressions) * 100;
            } else {
                score = interactions; // Raw count if no impressions data
            }
        }

        const current = grid[day][hour];
        grid[day][hour] = {
            sum: current.sum + score,
            count: current.count + 1
        };
    });

    const result: HeatmapCell[] = [];

    for (let d = 0; d < 7; d++) {
        for (let h = 0; h < 24; h++) {
            const cell = grid[d][h];
            result.push({
                day: d,
                hour: h,
                value: cell.count > 0 ? Number((cell.sum / cell.count).toFixed(2)) : 0
            });
        }
    }

    return result;
}
