/**
 * Push Notification Send API
 * Send test notifications (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import webpush from 'web-push';

/**
 * Checks if user has OWNER or ADMIN role in the workspace
 */
async function checkAdminAccess(workspaceId: string, userId: string): Promise<boolean> {
    const member = await db.workspaceMember.findUnique({
        where: {
            workspaceId_userId: { workspaceId, userId },
        },
    });
    return member?.role === 'OWNER' || member?.role === 'ADMIN';
}

/**
 * POST /api/push/send
 * Send a test push notification to all subscribers in workspace
 * Body: { title?, body?, url? }
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const hasAccess = await checkAdminAccess(session.user.currentWorkspaceId, session.user.id);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        // Get VAPID keys for workspace
        const vapidKeyPair = await db.vapidKeyPair.findUnique({
            where: { workspaceId: session.user.currentWorkspaceId },
        });

        if (!vapidKeyPair) {
            return NextResponse.json(
                { error: 'VAPID keys not configured. Generate keys in Settings first.' },
                { status: 400 }
            );
        }

        // Decrypt private key
        let privateKey: string;
        try {
            privateKey = decrypt(vapidKeyPair.privateKey);
        } catch {
            return NextResponse.json({ error: 'Failed to decrypt VAPID keys' }, { status: 500 });
        }

        // Get workspace for email (required by web-push)
        const workspace = await db.workspace.findUnique({
            where: { id: session.user.currentWorkspaceId },
            include: {
                members: {
                    where: { role: 'OWNER' },
                    include: { user: { select: { email: true } } },
                    take: 1,
                },
            },
        });

        const ownerEmail = workspace?.members[0]?.user?.email || 'admin@socialiseit.app';

        // Configure web-push
        webpush.setVapidDetails(
            `mailto:${ownerEmail}`,
            vapidKeyPair.publicKey,
            privateKey
        );

        // Get notification payload
        const body = await request.json();
        const payload = JSON.stringify({
            title: body.title || 'SocialiseIT',
            body: body.body || 'This is a test notification!',
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-72.png',
            tag: 'test-notification',
            data: { url: body.url || '/dashboard' },
        });

        // Get all subscriptions for test (just current user for true test)
        const subscriptions = await db.pushSubscription.findMany({
            where: { userId: session.user.id },
        });

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
        console.error('Failed to send push notification:', error);
        return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
    }
}
