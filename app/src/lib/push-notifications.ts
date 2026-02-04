/**
 * Push Notification Utilities
 * Centralized helpers for sending push notifications throughout the app
 * 
 * Why: Extracts notification logic from API routes for reuse by background workers
 */

import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import webpush from 'web-push';

/** Logger for notification events */
function log(level: 'info' | 'error', message: string, data?: Record<string, unknown>) {
    const prefix = '[push-notifications]';
    if (level === 'error') {
        console.error(prefix, message, data);
    } else {
        console.log(prefix, message, data);
    }
}

/**
 * Send a push notification to specific users in an organization.
 * Handles VAPID setup, user preferences, and subscription cleanup.
 */
async function sendPushToUsers(
    organizationId: string,
    userIds: string[],
    payload: {
        title: string;
        body: string;
        tag: string;
        url?: string;
    }
): Promise<{ sent: number; failed: number }> {
    // Get VAPID keys for organization
    const vapidKeyPair = await db.vapidKeyPair.findUnique({
        where: { organizationId },
    });

    if (!vapidKeyPair) {
        log('info', 'No VAPID keys configured for org', { organizationId });
        return { sent: 0, failed: 0 };
    }

    // Decrypt private key
    let privateKey: string;
    try {
        privateKey = decrypt(vapidKeyPair.privateKey);
    } catch {
        log('error', 'Failed to decrypt VAPID private key', { organizationId });
        return { sent: 0, failed: 0 };
    }

    // Get owner email for VAPID details
    const org = await db.organization.findUnique({
        where: { id: organizationId },
        include: {
            members: {
                where: { role: 'OWNER' },
                include: { user: { select: { email: true } } },
                take: 1,
            },
        },
    });

    const ownerEmail = org?.members[0]?.user?.email || 'noreply@localhost';

    // Configure web-push
    webpush.setVapidDetails(
        `mailto:${ownerEmail}`,
        vapidKeyPair.publicKey,
        privateKey
    );

    // Get subscriptions for specified users
    const subscriptions = await db.pushSubscription.findMany({
        where: {
            organizationId,
            userId: { in: userIds },
        },
    });

    if (subscriptions.length === 0) {
        log('info', 'No subscriptions found for users', { organizationId, userIds });
        return { sent: 0, failed: 0 };
    }

    const notificationPayload = JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        tag: payload.tag,
        data: { url: payload.url || '/calendar' },
    });

    // Send to all subscriptions
    const results = await Promise.allSettled(
        subscriptions.map(async (sub) => {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth,
                },
            };

            try {
                await webpush.sendNotification(pushSubscription, notificationPayload);
                return { id: sub.id, success: true };
            } catch (err) {
                // Clean up invalid subscriptions
                const error = err as { statusCode?: number };
                if (error.statusCode === 410 || error.statusCode === 404) {
                    await db.pushSubscription.delete({ where: { id: sub.id } });
                }
                throw err;
            }
        })
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    log('info', 'Push notifications sent', { sent, failed, organizationId });

    return { sent, failed };
}

/**
 * Send notification when a post fails to publish.
 * Respects user notification preferences (postFailed setting).
 */
export async function sendPostFailedNotification(
    organizationId: string,
    postId: string,
    caption: string,
    failedPlatforms: string[]
): Promise<void> {
    try {
        // Get all org members who have postFailed notifications enabled
        const members = await db.organizationMember.findMany({
            where: { organizationId },
            select: { userId: true },
        });

        const memberUserIds = members.map((m) => m.userId);

        // Check notification preferences
        const settings = await db.notificationSettings.findMany({
            where: {
                organizationId,
                userId: { in: memberUserIds },
                postFailed: true, // Only users who want failure notifications
            },
            select: { userId: true },
        });

        // Users who explicitly enabled, OR users with no settings (default: enabled)
        const usersWithSettings = settings.map((s) => s.userId);
        const usersWithoutSettings = memberUserIds.filter((id) => !usersWithSettings.includes(id));

        // By default, postFailed is true, so include users without explicit settings
        const notifyUserIds = [...usersWithSettings, ...usersWithoutSettings];

        if (notifyUserIds.length === 0) {
            log('info', 'No users to notify for post failure', { organizationId, postId });
            return;
        }

        const platformList = failedPlatforms.join(', ');
        const truncatedCaption = caption.length > 50 ? caption.slice(0, 50) + '...' : caption;

        await sendPushToUsers(organizationId, notifyUserIds, {
            title: '❌ Post Failed to Publish',
            body: `Failed on ${platformList}: "${truncatedCaption}"`,
            tag: `post-failed-${postId}`,
            url: `/calendar?highlight=${postId}`,
        });
    } catch (error) {
        // Non-blocking: log error but don't throw
        log('error', 'Failed to send post failure notification', { error, organizationId, postId });
    }
}

/**
 * Send notification when a post is successfully published.
 * Respects user notification preferences (postPublished setting).
 */
export async function sendPostPublishedNotification(
    organizationId: string,
    postId: string,
    caption: string,
    platforms: string[]
): Promise<void> {
    try {
        const members = await db.organizationMember.findMany({
            where: { organizationId },
            select: { userId: true },
        });

        const memberUserIds = members.map((m) => m.userId);

        const settings = await db.notificationSettings.findMany({
            where: {
                organizationId,
                userId: { in: memberUserIds },
                postPublished: true,
            },
            select: { userId: true },
        });

        const usersWithSettings = settings.map((s) => s.userId);
        const usersWithoutSettings = memberUserIds.filter((id) => !usersWithSettings.includes(id));
        const notifyUserIds = [...usersWithSettings, ...usersWithoutSettings];

        if (notifyUserIds.length === 0) return;

        const platformList = platforms.join(', ');
        const truncatedCaption = caption.length > 50 ? caption.slice(0, 50) + '...' : caption;

        await sendPushToUsers(organizationId, notifyUserIds, {
            title: '✅ Post Published',
            body: `Posted to ${platformList}: "${truncatedCaption}"`,
            tag: `post-published-${postId}`,
            url: `/calendar`,
        });
    } catch (error) {
        log('error', 'Failed to send post published notification', { error, organizationId, postId });
    }
}
