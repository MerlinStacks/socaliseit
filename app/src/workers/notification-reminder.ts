/**
 * Notification Reminder Worker
 * Sends push notifications when non-auto-publish posts reach their scheduled time
 */

import { Job, Worker } from 'bullmq';
import { getBullMQConnection } from '@/lib/bullmq/connection';
import { NotificationReminderJobData } from '@/lib/bullmq/queues';
import { sendPublishReminderNotification } from '@/lib/push-notifications';
import { createJobLogger } from '@/lib/logger';
import { db } from '@/lib/db';

/**
 * Process a reminder job: verify the post still needs a reminder, then send notification.
 */
async function processNotificationReminder(job: Job<NotificationReminderJobData>): Promise<void> {
    const log = createJobLogger(job.id || 'unknown', 'notification-reminder');
    const { postId, organizationId, caption, platform } = job.data;

    log.info({ postId, platform }, 'Processing publish reminder');

    // Verify the post still exists and is in SCHEDULED status
    // (user may have already published, deleted, or rescheduled it)
    const post = await db.post.findUnique({
        where: { id: postId },
        select: { status: true, autoPublish: true },
    });

    if (!post) {
        log.info({ postId }, 'Post no longer exists, skipping reminder');
        return;
    }

    if (post.status !== 'SCHEDULED') {
        log.info({ postId, status: post.status }, 'Post no longer scheduled, skipping reminder');
        return;
    }

    if (post.autoPublish) {
        log.info({ postId }, 'Post is now auto-publish, skipping reminder');
        return;
    }

    await sendPublishReminderNotification(organizationId, postId, caption, platform);
    log.info({ postId }, 'Publish reminder sent');
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
