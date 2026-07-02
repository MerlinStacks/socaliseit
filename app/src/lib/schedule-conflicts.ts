import { db } from '@/lib/db';
import type { Platform } from '@/generated/prisma/enums';

const BLOCKING_SCHEDULE_STATUSES = ['SCHEDULED', 'PUBLISHING'] as const;

export type ScheduleConflict = {
    postId: string;
    platform: string;
    scheduledAt: Date;
};

/**
 * Find an active post already scheduled for the same platform and exact time.
 * Why: One Post row represents one platform target, so same-platform collisions
 * should be blocked before queueing another publish/reminder at that instant.
 */
export async function findScheduleConflict(options: {
    organizationId: string;
    platforms: string[];
    scheduledAt: Date | null | undefined;
    excludePostId?: string;
}): Promise<ScheduleConflict | null> {
    const uniquePlatforms = [...new Set(options.platforms.filter(Boolean))];
    if (!options.scheduledAt || uniquePlatforms.length === 0) return null;

    const conflict = await db.post.findFirst({
        where: {
            organizationId: options.organizationId,
            platform: { in: uniquePlatforms as Platform[] },
            scheduledAt: options.scheduledAt,
            status: { in: [...BLOCKING_SCHEDULE_STATUSES] },
            ...(options.excludePostId ? { id: { not: options.excludePostId } } : {}),
        },
        select: { id: true, platform: true, scheduledAt: true },
    });

    if (!conflict?.platform || !conflict.scheduledAt) return null;

    return {
        postId: conflict.id,
        platform: conflict.platform,
        scheduledAt: conflict.scheduledAt,
    };
}

export function formatScheduleConflictError(conflict: ScheduleConflict): string {
    return `A ${conflict.platform.toLowerCase()} post is already scheduled for ${conflict.scheduledAt.toISOString()}`;
}

export function findDuplicatePlatforms(platforms: string[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    for (const platform of platforms.filter(Boolean)) {
        if (seen.has(platform)) duplicates.add(platform);
        seen.add(platform);
    }

    return [...duplicates];
}
