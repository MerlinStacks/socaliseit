/**
 * AI Draft Generator Service
 * 
 * Creates draft posts at AI-recommended optimal times for organizations
 * that have aiDraftsEnabled. These drafts appear on the calendar as
 * suggestions for when to post on each platform.
 * 
 * Why: Users want to see AI-suggested posting times as actual drafts
 * on their calendar, making it clear when they should create content.
 */

import { db } from '@/lib/db';
import { getOptimalPostingTimes, Recommendation, PostType } from '@/lib/ai/smart-scheduling';
import { Platform } from '@/generated/prisma/enums';
import { addDays, isBefore, isEqual, startOfDay, startOfWeek, format, differenceInMinutes } from 'date-fns';

/**
 * Generate AI draft posts for the upcoming week for an organization.
 * Skips slots that already have posts scheduled or whose time has passed.
 */
export async function generateAiDrafts(organizationId: string): Promise<{
    created: number;
    skipped: number;
    cleaned: number;
}> {
    // 1. Check if org has AI drafts enabled
    const org = await db.organization.findUnique({
        where: { id: organizationId },
        select: { aiDraftsEnabled: true }
    });

    if (!org?.aiDraftsEnabled) {
        return { created: 0, skipped: 0, cleaned: 0 };
    }

    // 2. Get AI recommendations for optimal posting times (1 month ahead)
    const recommendations = await getOptimalPostingTimes(organizationId, undefined, 5);
    const now = new Date();

    // 3. Get existing posts (both AI and manual) for 1 month ahead
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const monthEnd = addDays(weekStart, 35); // 5 weeks = ~1 month

    const existingPosts = await db.post.findMany({
        where: {
            organizationId,
            scheduledAt: {
                gte: weekStart,
                lt: monthEnd
            },
            status: { in: ['DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED'] }
        },
        include: {
            platforms: {
                include: {
                    socialAccount: {
                        select: { platform: true }
                    }
                }
            }
        }
    });

    // 4. Build occupied slots and scheduled times for proximity detection
    const occupiedSlots = new Set<string>();
    const scheduledPostsByPlatform = new Map<Platform, Date[]>();

    for (const post of existingPosts) {
        if (post.scheduledAt) {
            const dateStr = format(post.scheduledAt, 'yyyy-MM-dd');
            const hour = post.scheduledAt.getHours();
            const postType = (post as { postType?: string }).postType || 'POST';
            for (const pp of post.platforms) {
                const platform = pp.socialAccount.platform;
                const key = `${dateStr}-${hour}-${platform}-${postType}`;
                occupiedSlots.add(key);

                // Store scheduled times for proximity checking
                const times = scheduledPostsByPlatform.get(platform) || [];
                times.push(post.scheduledAt);
                scheduledPostsByPlatform.set(platform, times);
            }
        }
    }

    // 5. Get existing AI drafts to avoid duplicates
    const existingAiDrafts = await db.post.findMany({
        where: {
            organizationId,
            isAiGenerated: true,
            status: 'DRAFT',
            scheduledAt: { gte: now }
        },
        include: {
            platforms: {
                select: {
                    postType: true,
                    socialAccount: { select: { platform: true } }
                }
            }
        }
    });

    const existingAiSlots = new Set<string>();
    for (const draft of existingAiDrafts) {
        if (draft.scheduledAt) {
            const dateStr = format(draft.scheduledAt, 'yyyy-MM-dd');
            const hour = draft.scheduledAt.getHours();
            for (const pp of draft.platforms) {
                const postType = pp.postType || 'FEED';
                const key = `${dateStr}-${hour}-${pp.socialAccount.platform}-${postType}`;
                existingAiSlots.add(key);
            }
        }
    }

    // 6. Cleanup: Remove past AI drafts
    const cleanupResult = await db.post.deleteMany({
        where: {
            organizationId,
            isAiGenerated: true,
            status: 'DRAFT',
            scheduledAt: { lt: now }
        }
    });

    // 7. Create AI drafts for unoccupied future slots
    let created = 0;
    let skipped = 0;

    for (const rec of recommendations) {
        // Skip if time has passed
        const slotTime = new Date(rec.date);
        slotTime.setHours(rec.hour, rec.minute, 0, 0);

        if (isBefore(slotTime, now)) {
            skipped++;
            continue;
        }

        const slotKey = `${format(rec.date, 'yyyy-MM-dd')}-${rec.hour}-${rec.platform}-${rec.postType || 'POST'}`;

        // Skip if slot already has a post
        if (occupiedSlots.has(slotKey)) {
            skipped++;
            continue;
        }

        // Skip if AI draft already exists for this slot
        if (existingAiSlots.has(slotKey)) {
            skipped++;
            continue;
        }

        // Proximity conflict detection: skip if within ±30 min of existing scheduled post
        const platformScheduled = scheduledPostsByPlatform.get(rec.platform as Platform) || [];
        const hasNearbyPost = platformScheduled.some(scheduledTime => {
            const minuteDiff = Math.abs(differenceInMinutes(slotTime, scheduledTime));
            return minuteDiff < 30;
        });
        if (hasNearbyPost) {
            skipped++;
            continue;
        }

        // Find a social account for this platform
        const socialAccount = await db.socialAccount.findFirst({
            where: {
                organizationId,
                platform: rec.platform as Platform,
                isActive: true
            }
        });

        if (!socialAccount) {
            skipped++;
            continue;
        }

        // Create the AI draft post with post type
        // Plain text labels - UI renders icons based on postType
        const postTypeLabels: Record<string, string> = {
            FEED: 'Post',
            REEL: 'Reel/Short',
            STORY: 'Story',
            CAROUSEL: 'Carousel',
            PIN: 'Pin',
            VIDEO: 'Video',
            ARTICLE: 'Article',
            THREAD: 'Thread',
        };
        const postTypeLabel = postTypeLabels[rec.postType || 'FEED'] || 'Post';

        await db.post.create({
            data: {
                organizationId,
                caption: `AI suggests a ${postTypeLabel} here!\n\n${rec.reason}`,
                status: 'DRAFT',
                isAiGenerated: true,
                scheduledAt: slotTime,
                platforms: {
                    create: {
                        socialAccountId: socialAccount.id,
                        status: 'DRAFT',
                        postType: rec.postType || PostType.FEED,
                    }
                }
            }
        });

        created++;
    }

    return { created, skipped, cleaned: cleanupResult.count };
}

/**
 * Cleanup expired/filled AI drafts for an organization.
 * Called periodically to remove AI drafts that are no longer relevant.
 */
export async function cleanupAiDrafts(organizationId: string): Promise<number> {
    const now = new Date();

    // Delete AI drafts whose scheduled time has passed
    const result = await db.post.deleteMany({
        where: {
            organizationId,
            isAiGenerated: true,
            status: 'DRAFT',
            scheduledAt: { lt: now }
        }
    });

    return result.count;
}

/**
 * Cleanup AI drafts that conflict with manually scheduled posts.
 * Called when a user schedules a post to remove the AI suggestion in that slot.
 */
export async function cleanupConflictingAiDrafts(
    organizationId: string,
    scheduledAt: Date,
    platform: Platform
): Promise<number> {
    // Find AI drafts in the same hour slot for the same platform
    const slotStart = new Date(scheduledAt);
    slotStart.setMinutes(0, 0, 0);
    const slotEnd = new Date(scheduledAt);
    slotEnd.setMinutes(59, 59, 999);

    const result = await db.post.deleteMany({
        where: {
            organizationId,
            isAiGenerated: true,
            status: 'DRAFT',
            scheduledAt: { gte: slotStart, lte: slotEnd },
            platforms: {
                some: {
                    socialAccount: { platform }
                }
            }
        }
    });

    return result.count;
}
