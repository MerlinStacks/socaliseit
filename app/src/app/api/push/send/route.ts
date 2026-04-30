/**
 * Push Notification Send API
 * Send test notifications (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/utils';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import webpush from 'web-push';
import { getSystemVapidKeys } from '@/lib/push-notifications';
import { createRouteLogger } from '@/lib/logger';

/**
 * Checks if user has OWNER or ADMIN role in the workspace
 */
async function checkAdminAccess(organizationId: string, userId: string): Promise<boolean> {
    const member = await db.organizationMember.findUnique({
        where: {
            organizationId_userId: { organizationId, userId },
        },
    });
    return member?.role === 'OWNER' || member?.role === 'ADMIN';
}

const VAPID_CONTACT_EMAIL = process.env.VAPID_CONTACT_EMAIL || 'noreply@socialiseit.com';

/**
 * POST /api/push/send
 * Send a test push notification to all subscribers in workspace
 * Body: { title?, body?, url?, deviceIds? }
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const hasAccess = await checkAdminAccess(session.user.currentOrganizationId, session.user.id);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        // Get system-wide VAPID keys
        const vapidKeys = await getSystemVapidKeys();
        if (!vapidKeys) {
            return NextResponse.json(
                { error: 'VAPID keys not configured. A super admin must generate them first.' },
                { status: 400 }
            );
        }

        webpush.setVapidDetails(
            `mailto:${VAPID_CONTACT_EMAIL}`,
            vapidKeys.publicKey,
            vapidKeys.privateKey
        );

        // Get notification payload
        const parseResult = await safeParseJson(request);
        if (!parseResult.ok) {
            return NextResponse.json({ error: parseResult.error }, { status: 400 });
        }
        const body = parseResult.data;
        const payload = JSON.stringify({
            title: body.title || 'Overseek Socials',
            body: body.body || 'This is a test notification!',
            icon: '/icons/icon-192.png',
            badge: '/icons/badge-72.png',
            tag: 'test-notification',
            data: { url: body.url || '/dashboard' },
        });

        // If deviceIds specified, target only those devices' subscriptions
        const deviceIds: string[] | undefined = body.deviceIds;

        let subscriptions;
        if (deviceIds && deviceIds.length > 0) {
            // Resolve device IDs → linked push subscriptions
            const devices = await db.notificationDevice.findMany({
                where: {
                    id: { in: deviceIds },
                    organizationId: session.user.currentOrganizationId,
                    pushSubscriptionId: { not: null },
                },
                include: { pushSubscription: true },
            });
            subscriptions = devices
                .map((d) => d.pushSubscription)
                .filter((s): s is NonNullable<typeof s> => Boolean(s));
        } else {
            // Default: send to current user's subscriptions
            subscriptions = await db.pushSubscription.findMany({
                where: { userId: session.user.id },
            });
        }

        if (subscriptions.length === 0) {
            return NextResponse.json(
                { error: 'No active subscriptions. Enable push notifications first.' },
                { status: 400 }
            );
        }

        // Send to all user's subscriptions
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
                    await webpush.sendNotification(pushSubscription, payload);
                    return { id: sub.id, success: true };
                } catch (err) {
                    // If subscription is invalid, remove it
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

        return NextResponse.json({
            success: true,
            sent,
            failed,
            message: `Notification sent to ${sent} device(s)`,
        });
    } catch (error) {
        createRouteLogger('API', '/api/push/send').error({ err: error }, 'Failed to send push notification');
        return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
    }
}
