/**
 * Notification Reminder Worker
 * Sends push notifications when non-auto-publish posts reach their scheduled time
 */

import { DelayedError, Job, Worker } from 'bullmq';
import { getBullMQConnection } from '@/lib/bullmq/connection';
import { NotificationReminderJobData } from '@/lib/bullmq/queues';
import { sendPublishReminderNotification } from '@/lib/push-notifications';
import { createJobLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { acquirePublishLock, releasePublishLock } from '@/lib/publish-lock';

/**
 * Process a reminder job: verify the post still needs a reminder, then send notification.
 */
export async function processNotificationReminder(job: Job<NotificationReminderJobData>, jobToken?: string): Promise<void> {
    const log = createJobLogger(job.id || 'unknown', 'notification-reminder');
    const { postId, organizationId, caption, platform } = job.data;

    log.info({ postId, platform }, 'Processing publish reminder');

    const lock = await acquirePublishLock(postId);
    if (!lock) throw new Error('Schedule is being updated; retrying reminder');
    try {
        const post = await db.post.findUnique({
            where: { id: postId, organizationId },
            select: { status: true, autoPublish: true, scheduledAt: true },
        });
        if (!post || post.status !== 'SCHEDULED' || post.autoPublish || !post.scheduledAt) return;

        const due = post.scheduledAt.getTime();
        const intended = job.data.scheduledAt ? Date.parse(job.data.scheduledAt) : job.timestamp + (job.opts.delay ?? 0);
        // Older producers calculated the delay just before BullMQ took its timestamp.
        if (!Number.isFinite(intended) || Math.abs(due - intended) > (job.data.scheduledAt ? 0 : 1_000)) {
            log.info({ postId }, 'Ignoring obsolete reminder after a schedule change');
            return;
        }
        if (due > Date.now()) {
            await job.moveToDelayed(due, jobToken);
            throw new DelayedError();
        }
        await sendPublishReminderNotification(organizationId, postId, caption, platform);
        log.info({ postId }, 'Publish reminder sent');
    } finally {
        await releasePublishLock(postId, lock);
    }
}

/**
 * Create and start the notification reminder worker.
 */
export function createNotificationReminderWorker(): Worker<NotificationReminderJobData> {
    const worker = new Worker<NotificationReminderJobData>('notification-reminder', processNotificationReminder, {
        connection: getBullMQConnection(),
        concurrency: 5,
    });

    worker.on('completed', (job) => {
        const log = createJobLogger(job.id || 'unknown', 'notification-reminder');
        log.info('Reminder job completed');
    });

    worker.on('failed', (job, err) => {
        const log = createJobLogger(job?.id || 'unknown', 'notification-reminder');
        log.error({ err }, 'Reminder job failed');
    });

    return worker;
}
