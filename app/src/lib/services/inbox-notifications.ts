/**
 * Inbox Notification Service
 *
 * Why: The engagement sync pipeline inserts comments/DMs/mentions/reviews into
 * the DB but never alerts users. This service bridges that gap by creating
 * Notification records and firing web-push alerts when new items land.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// ============================================================================
// Types
// ============================================================================

interface InboxNotificationCounts {
    organizationId: string;
    commentsAdded: number;
    mentionsAdded: number;
    dmsAdded: number;
    reviewsAdded: number;
}

type InboxCategory = 'newComment' | 'newDM' | 'newMention' | 'newReview';

interface CategoryConfig {
    settingKey: InboxCategory;
    count: number;
    title: string;
    message: string;
    link: string;
    pushTag: string;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Create Notification records and send push alerts for newly synced inbox items.
 *
 * Why: Called at the end of engagement/review sync. Only fires when counts > 0.
 * Respects per-user NotificationSettings preferences for each category.
 * Batches DB writes with createMany for efficiency.
 */
export async function sendInboxNotifications(
    counts: InboxNotificationCounts,
): Promise<void> {
    const { organizationId, commentsAdded, mentionsAdded, dmsAdded, reviewsAdded } = counts;

    const totalNew = commentsAdded + mentionsAdded + dmsAdded + reviewsAdded;
    if (totalNew === 0) return;

    /** Why: Build an array of categories that actually have new items. */
    const categories: CategoryConfig[] = [];

    if (commentsAdded > 0) {
        categories.push({
            settingKey: 'newComment',
            count: commentsAdded,
            title: '💬 New Comments',
            message: `${commentsAdded} new comment${commentsAdded > 1 ? 's' : ''} in your inbox`,
            link: '/engagement?tab=comments',
            pushTag: 'inbox-comments',
        });
    }

    if (dmsAdded > 0) {
        categories.push({
            settingKey: 'newDM',
            count: dmsAdded,
            title: '✉️ New Messages',
            message: `${dmsAdded} new direct message${dmsAdded > 1 ? 's' : ''} received`,
            link: '/engagement?tab=messages',
            pushTag: 'inbox-dms',
        });
    }

    if (mentionsAdded > 0) {
        categories.push({
            settingKey: 'newMention',
            count: mentionsAdded,
            title: '📣 New Mentions',
            message: `${mentionsAdded} new mention${mentionsAdded > 1 ? 's' : ''}`,
            link: '/engagement?tab=mentions',
            pushTag: 'inbox-mentions',
        });
    }

    if (reviewsAdded > 0) {
        categories.push({
            settingKey: 'newReview',
            count: reviewsAdded,
            title: '⭐ New Reviews',
            message: `${reviewsAdded} new review${reviewsAdded > 1 ? 's' : ''} to respond to`,
            link: '/engagement?tab=reviews',
            pushTag: 'inbox-reviews',
        });
    }

    if (categories.length === 0) return;

    try {
        /** Why: Fetch all org members once to avoid repeated DB hits per category. */
        const members = await db.organizationMember.findMany({
            where: { organizationId },
            select: { userId: true },
        });
        const memberUserIds = members.map((m) => m.userId);

        if (memberUserIds.length === 0) return;

        /**
         * Why: Fetch NotificationSettings for all members in one query.
         * Users without a settings row get default-on behaviour for all categories.
         */
        const settingsRows = await db.notificationSettings.findMany({
            where: {
                organizationId,
                userId: { in: memberUserIds },
            },
        });
        const settingsMap = new Map(settingsRows.map((s) => [s.userId, s]));

        for (const cat of categories) {
            /** Why: Only notify users who haven't opted out of this category. */
            const notifyUserIds = memberUserIds.filter((uid) => {
                const prefs = settingsMap.get(uid);
                /* No settings row → defaults are all true → notify */
                if (!prefs) return true;
                return prefs[cat.settingKey] !== false;
            });

            if (notifyUserIds.length === 0) continue;

            /** Why: Batch-create Notification records — one per user per category. */
            await db.notification.createMany({
                data: notifyUserIds.map((userId) => ({
                    organizationId,
                    userId,
                    type: 'info',
                    title: cat.title,
                    message: cat.message,
                    link: cat.link,
                    isRead: false,
                })),
            });

            /** Why: Send push notification in best-effort mode — failure is non-blocking. */
            try {
                const { sendPushToUsers } = await import('@/lib/push-notifications');
                await sendPushToUsers(organizationId, notifyUserIds, {
                    title: cat.title,
                    body: cat.message,
                    tag: cat.pushTag,
                    url: cat.link,
                });
            } catch (pushErr) {
                /* Why: Push failures must not block notification record creation. */
                logger.warn({ err: pushErr, category: cat.settingKey }, 'Push delivery failed for inbox notification');
            }
        }

        logger.info(
            { organizationId, commentsAdded, mentionsAdded, dmsAdded, reviewsAdded },
            'Inbox notifications sent',
        );
    } catch (error) {
        /* Why: Non-blocking — sync should succeed even if notifications fail. */
        logger.error({ err: error, organizationId }, 'Failed to send inbox notifications');
    }
}
