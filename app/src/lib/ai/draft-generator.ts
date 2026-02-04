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
import { getOptimalPostingTimes, Recommendation } from '@/lib/ai/smart-scheduling';
import { Platform } from '@/generated/prisma/enums';
import { addDays, isBefore, isEqual, startOfDay, startOfWeek, format } from 'date-fns';

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

    // 2. Get AI recommendations for optimal posting times
    const recommendations = await getOptimalPostingTimes(organizationId);
    const now = new Date();

    // 3. Get existing posts (both AI and manual) for the week
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = addDays(weekStart, 7);

    const existingPosts = await db.post.findMany({
        where: {
            organizationId,
            scheduledAt: {
                gte: weekStart,
                lt: weekEnd
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

    // 4. Build a set of occupied slots (date + hour + platform)
    const occupiedSlots = new Set<string>();
    for (const post of existingPosts) {
        if (post.scheduledAt) {
            const dateStr = format(post.scheduledAt, 'yyyy-MM-dd');
            const hour = post.scheduledAt.getHours();
            for (const pp of post.platforms) {
                const key = `${dateStr}-${hour}-${pp.socialAccount.platform}`;
                occupiedSlots.add(key);
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
        select: { scheduledAt: true, platforms: { select: { socialAccount: { select: { platform: true } } } } }
    });

    const existingAiSlots = new Set<string>();
    for (const draft of existingAiDrafts) {
        if (draft.scheduledAt) {
            const dateStr = format(draft.scheduledAt, 'yyyy-MM-dd');
            const hour = draft.scheduledAt.getHours();
            for (const pp of draft.platforms) {
                const key = `${dateStr}-${hour}-${pp.socialAccount.platform}`;
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

        const slotKey = `${format(rec.date, 'yyyy-MM-dd')}-${rec.hour}-${rec.platform}`;

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

        // Create the AI draft post
        await db.post.create({
            data: {
                organizationId,
                caption: `✨ AI suggests posting here!\n\n${rec.reason}`,
                status: 'DRAFT',
                isAiGenerated: true,
                scheduledAt: slotTime,
                platforms: {
                    create: {
                        socialAccountId: socialAccount.id,
                        status: 'DRAFT'
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
