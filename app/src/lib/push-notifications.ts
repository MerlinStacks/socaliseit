/**
 * Push Notification Utilities
 * Centralized helpers for sending push notifications throughout the app
 *
 * Why: Extracts notification logic from API routes for reuse by background workers
 */

import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import webpush from 'web-push';
import { logger as baseLogger } from '@/lib/logger';

/** Why: Scoped child logger avoids repeating module context in every call */
const logger = baseLogger.child({ module: 'push-notifications' });

const VAPID_SINGLETON_ID = 'vapid_keys';

/**
 * Why: VAPID contact email for the `mailto:` subject in VAPID details.
 * Falls back to a sensible default when the env var isn't set.
 */
const VAPID_CONTACT_EMAIL = process.env.VAPID_CONTACT_EMAIL || 'noreply@socialiseit.com';

/**
 * Retrieve the system-wide VAPID key pair (decrypted).
 * Returns null if keys have not been generated yet.
 */
export async function getSystemVapidKeys(): Promise<{
    publicKey: string;
    privateKey: string;
} | null> {
    const keyPair = await db.vapidKeyPair.findUnique({
        where: { id: VAPID_SINGLETON_ID },
    });

    if (!keyPair) return null;

    try {
        const privateKey = decrypt(keyPair.privateKey);
        return { publicKey: keyPair.publicKey, privateKey };
    } catch {
        logger.error('Failed to decrypt system VAPID private key');
        return null;
    }
}

/**
 * Configure web-push with the system-wide VAPID keys.
 * Returns false if keys are missing or corrupt.
 */
/** Why: Module-level flag to avoid hitting DB on every notification send. */
let vapidConfigured = false;
async function configureVapid(): Promise<boolean> {
    if (vapidConfigured) return true;

    const keys = await getSystemVapidKeys();
    if (!keys) {
        logger.info('No system VAPID keys configured');
        return false;
    }

    webpush.setVapidDetails(
        `mailto:${VAPID_CONTACT_EMAIL}`,
        keys.publicKey,
        keys.privateKey
    );
    vapidConfigured = true;
    return true;
}

/** Payload shape shared by all notification senders */
interface NotificationPayload {
    title: string;
    body: string;
    tag: string;
    url?: string;
    actions?: Array<{ action: string; title: string }>;
}

/**
 * Deliver a notification to a set of PushSubscription records.
 * Handles serialization, sending via web-push, and cleanup of stale subscriptions.
 *
 * Why: Extracted from sendPushToUsers/sendPushToDevices to eliminate
 * ~40 lines of duplicated delivery + cleanup logic.
 */
async function deliverToSubscriptions(
    subscriptions: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>,
    payload: NotificationPayload
): Promise<{ sent: number; failed: number }> {
    if (subscriptions.length === 0) return { sent: 0, failed: 0 };

    const body = JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        tag: payload.tag,
        data: { url: payload.url || '/calendar' },
        actions: payload.actions,
    });

    const results = await Promise.allSettled(
        subscriptions.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    body
                );
                return { id: sub.id, success: true };
            } catch (err) {
                const error = err as { statusCode?: number };
                if (error.statusCode === 410 || error.statusCode === 404) {
                    await db.pushSubscription.delete({ where: { id: sub.id } });
                }
                throw err;
            }
        })
    );

    return {
        sent: results.filter((r) => r.status === 'fulfilled').length,
        failed: results.filter((r) => r.status === 'rejected').length,
    };
}

/**
 * Send a push notification to specific users in an organization.
 * Handles VAPID setup, user preferences, and subscription cleanup.
 */
export async function sendPushToUsers(
    organizationId: string,
    userIds: string[],
    payload: NotificationPayload
): Promise<{ sent: number; failed: number }> {
    const ready = await configureVapid();
    if (!ready) return { sent: 0, failed: 0 };

    const subscriptions = await db.pushSubscription.findMany({
        where: { organizationId, userId: { in: userIds } },
    });

    if (subscriptions.length === 0) {
        logger.info({ organizationId, userIds }, 'No subscriptions found for users');
        return { sent: 0, failed: 0 };
    }

    const result = await deliverToSubscriptions(subscriptions, payload);
    logger.info({ ...result, organizationId }, 'Push notifications sent');
    return result;
}

/**
 * Send a push notification to specific registered devices in an organization.
 * Resolves NotificationDevice → PushSubscription, then delivers.
 *
 * Why: Allows manual publish reminders to target only chosen devices
 * instead of broadcasting to all subscriptions.
 */
export async function sendPushToDevices(
    organizationId: string,
    deviceIds: string[],
    payload: NotificationPayload
): Promise<{ sent: number; failed: number }> {
    const devices = await db.notificationDevice.findMany({
        where: {
            id: { in: deviceIds },
            organizationId,
            pushSubscriptionId: { not: null },
        },
        select: { pushSubscription: true },
    });

    const subscriptionIds = devices
        .map((d) => d.pushSubscription?.id)
        .filter((id): id is string => Boolean(id));

    if (subscriptionIds.length === 0) {
        logger.info({ organizationId, deviceIds }, 'No linked subscriptions for specified devices');
        return { sent: 0, failed: 0 };
    }

    const ready = await configureVapid();
    if (!ready) return { sent: 0, failed: 0 };

    const subscriptions = await db.pushSubscription.findMany({
        where: { id: { in: subscriptionIds } },
    });

    const result = await deliverToSubscriptions(subscriptions, payload);
    logger.info({ ...result, organizationId, deviceCount: deviceIds.length }, 'Push notifications sent to devices');
    return result;
}

/**
 * Send notification when a post fails to publish.
 * Respects user notification preferences (postFailed setting).
 */
export async function sendPostFailedNotification(
    organizationId: string,
    postId: string,
    caption: string,
    failedPlatforms: string[],
    /** User-friendly reason explaining why it failed */
    errorReason?: string
): Promise<void> {
    try {
        // Get all org members who have postFailed notifications enabled
        const members = await db.organizationMember.findMany({
            where: { organizationId },
            select: { userId: true },
        });

        const memberUserIds = members.map((m) => m.userId);

        // Why (BUG-FIX #13): Query ALL settings rows to distinguish "opted out"
        // from "no row exists" (defaults to on). Previously, users with postFailed: false
        // were excluded by the WHERE filter but then re-added as "no settings" users.
        const settings = await db.notificationSettings.findMany({
            where: {
                organizationId,
                userId: { in: memberUserIds },
            },
            select: { userId: true, postFailed: true },
        });

        const usersWhoOptedIn = settings.filter(s => s.postFailed).map(s => s.userId);
        const usersWhoOptedOut = settings.filter(s => !s.postFailed).map(s => s.userId);
        const usersWithoutSettings = memberUserIds.filter(
            id => !usersWhoOptedIn.includes(id) && !usersWhoOptedOut.includes(id)
        );
        // Default: on — include users with no settings row
        const notifyUserIds = [...usersWhoOptedIn, ...usersWithoutSettings];

        if (notifyUserIds.length === 0) {
            logger.info({ organizationId, postId }, 'No users to notify for post failure');
            return;
        }

        const platformList = failedPlatforms.join(', ');
        const truncatedCaption = caption.length > 50 ? caption.slice(0, 50) + '...' : caption;

        // Build notification body with context about why it failed
        let body = `Failed on ${platformList}`;
        if (errorReason) {
            body += `: ${errorReason}`;
        } else {
            body += `: "${truncatedCaption}"`;
        }

        await sendPushToUsers(organizationId, notifyUserIds, {
            title: '❌ Post Failed to Publish',
            body,
            tag: `post-failed-${postId}`,
            url: `/post-failed?postId=${postId}`,
            actions: [
                { action: 'retry', title: '🔄 Retry' },
                { action: 'manual', title: '📲 Post Manually' },
            ],
        });
    } catch (error) {
        // Non-blocking: log error but don't throw
        logger.error({ err: error, organizationId, postId }, 'Failed to send post failure notification');
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

        // Why (BUG-FIX #13): Same fix as postFailed — distinguish opted-out from no-row.
        const settings = await db.notificationSettings.findMany({
            where: {
                organizationId,
                userId: { in: memberUserIds },
            },
            select: { userId: true, postPublished: true },
        });

        const usersWhoOptedIn = settings.filter(s => s.postPublished).map(s => s.userId);
        const usersWhoOptedOut = settings.filter(s => !s.postPublished).map(s => s.userId);
        const usersWithoutSettings = memberUserIds.filter(
            id => !usersWhoOptedIn.includes(id) && !usersWhoOptedOut.includes(id)
        );
        const notifyUserIds = [...usersWhoOptedIn, ...usersWithoutSettings];

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
        logger.error({ err: error, organizationId, postId }, 'Failed to send post published notification');
    }
}

/**
 * Send notification when a non-auto-publish post reaches its scheduled time.
 * Prompts the user to manually publish via the app.
 * Respects user notification preferences (postReadyToPublish setting).
 */
export async function sendPublishReminderNotification(
    organizationId: string,
    postId: string,
    caption: string,
    platform: string,
    /** When set, only these registered devices receive the reminder */
    deviceIds?: string[]
): Promise<void> {
    try {
        const truncatedCaption = caption.length > 50 ? caption.slice(0, 50) + '...' : caption;

        const notifPayload = {
            title: '📲 Ready to Publish',
            body: `Your ${platform} post is ready: "${truncatedCaption}"`,
            tag: `publish-reminder-${postId}`,
            url: `/publish-ready?postId=${postId}`,
        };

        // If specific devices are targeted, send directly to them
        if (deviceIds && deviceIds.length > 0) {
            await sendPushToDevices(organizationId, deviceIds, notifPayload);
            logger.info({ organizationId, postId, platform, deviceCount: deviceIds.length }, 'Publish reminder sent to targeted devices');
            return;
        }

        // Otherwise broadcast to all org members who want publish reminders
        const members = await db.organizationMember.findMany({
            where: { organizationId },
            select: { userId: true },
        });

        const memberUserIds = members.map((m) => m.userId);

        // Why (BUG-FIX #13): Same fix — distinguish opted-out from no-row.
        const settings = await db.notificationSettings.findMany({
            where: {
                organizationId,
                userId: { in: memberUserIds },
            },
            select: { userId: true, postReadyToPublish: true },
        });

        const usersWhoOptedIn = settings.filter(s => s.postReadyToPublish).map(s => s.userId);
        const usersWhoOptedOut = settings.filter(s => !s.postReadyToPublish).map(s => s.userId);
        const usersWithoutSettings = memberUserIds.filter(
            id => !usersWhoOptedIn.includes(id) && !usersWhoOptedOut.includes(id)
        );
        const notifyUserIds = [...usersWhoOptedIn, ...usersWithoutSettings];

        if (notifyUserIds.length === 0) return;

        await sendPushToUsers(organizationId, notifyUserIds, notifPayload);

        logger.info({ organizationId, postId, platform }, 'Publish reminder notification sent');
    } catch (error) {
        logger.error({ err: error, organizationId, postId }, 'Failed to send publish reminder notification');
    }
}
