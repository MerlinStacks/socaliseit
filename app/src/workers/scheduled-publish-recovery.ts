import { postPublishQueue } from '@/lib/bullmq/queues';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { acquirePublishLock, releasePublishLock } from '@/lib/publish-lock';
import { SAFE_PUBLISH_FAILURES } from '@/lib/publishing-status';

// Allow the 15-minute publish lease to expire after a crash, plus time for the
// five-minute cleanup tick. Never silently backfill much older content.
const RECOVERY_WINDOW_MS = 30 * 60_000;
const liveOrFailedStates = ['waiting', 'delayed', 'active', 'prioritized', 'paused', 'failed'] as const;

export async function recoverScheduledPublishes(now = new Date()) {
    const lower = new Date(now.getTime() - RECOVERY_WINDOW_MS);
    const upper = new Date(now.getTime() + RECOVERY_WINDOW_MS);
    const where = {
        status: 'SCHEDULED' as const,
        autoPublish: true,
        isExternal: false,
        platformPostId: null,
        socialAccountId: { not: null },
        scheduledAt: { gte: lower, lte: upper },
    };
    const scheduled = await db.post.findMany({
        where,
        select: { id: true, updatedAt: true, organizationId: true, scheduledAt: true, socialAccountId: true },
        orderBy: { scheduledAt: 'asc' },
    });
    if (!scheduled.length) return;

    const jobs = await postPublishQueue.getJobs([...liveOrFailedStates]);
    const indexed = new Map<string, typeof jobs>();
    for (const job of jobs) {
        const existing = indexed.get(job.data.postId) ?? [];
        if (!existing.length) indexed.set(job.data.postId, existing);
        existing.push(job);
    }

    for (const post of scheduled) {
        if (!post.scheduledAt || !post.socialAccountId) continue;
        const scheduledAt = post.scheduledAt.toISOString();
        if (indexed.get(post.id)?.some(job => job.data.organizationId === post.organizationId
            && (job.data.scheduledAt === scheduledAt || !job.data.scheduledAt))) continue;

        const token = await acquirePublishLock(post.id);
        if (!token) continue;
        try {
            // Revalidate the DB snapshot after acquiring the same lock as edits
            // and publishers. Another recovery attempt uses the same BullMQ ID.
            const current = await db.post.findFirst({ where: { ...where, id: post.id, organizationId: post.organizationId,
                scheduledAt: post.scheduledAt, updatedAt: post.updatedAt }, select: { id: true } });
            if (!current) continue;
            // A scheduler can commit its DB change before enqueueing. It may
            // have added the job since the sweep took its first Redis snapshot.
            if ((await postPublishQueue.getJobs([...liveOrFailedStates])).some(job =>
                job.data.postId === post.id && job.data.organizationId === post.organizationId
                && (job.data.scheduledAt === scheduledAt || !job.data.scheduledAt))) continue;
            const latestError = await db.publishError.findFirst({ where: { postId: post.id }, orderBy: { occurredAt: 'desc' }, select: { errorCode: true } });
            if (latestError && !SAFE_PUBLISH_FAILURES.has(latestError.errorCode ?? '')) continue;
            const delay = post.scheduledAt.getTime() - Date.now();
            if (delay < -RECOVERY_WINDOW_MS) continue;
            await postPublishQueue.add(`publish-${post.id}`, {
                postId: post.id, organizationId: post.organizationId, platformIds: [post.socialAccountId], scheduledAt,
                recoverBefore: new Date(post.scheduledAt.getTime() + RECOVERY_WINDOW_MS).toISOString(),
            }, {
                delay: Math.max(0, delay),
                jobId: `post-recovery-${post.id}-${post.scheduledAt.getTime()}-${post.updatedAt.getTime()}`,
            });
            logger.info({ postId: post.id, scheduledAt }, 'Recovered missing scheduled publish job');
        } catch (err) {
            logger.warn({ err, postId: post.id }, 'Could not recover scheduled publish job');
        } finally {
            await releasePublishLock(post.id, token);
        }
    }
}
