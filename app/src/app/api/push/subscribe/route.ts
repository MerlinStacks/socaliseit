/**
 * Push Subscription API
 * Subscribe/unsubscribe from push notifications
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createRouteLogger } from '@/lib/logger';

/**
 * Derive a user-friendly device name from a raw User-Agent string.
 * Falls back to a truncated UA if parsing fails.
 */
function deriveDeviceLabel(
    userAgent: string | undefined,
    userName: string | null | undefined
): string {
    if (!userAgent) return `${userName || 'Unknown'}'s Device`;

    // Try to extract OS and browser from common UA patterns
    let os = 'Unknown';
    let browser = 'Browser';

    if (userAgent.includes('iPhone')) os = 'iPhone';
    else if (userAgent.includes('iPad')) os = 'iPad';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('Windows')) os = 'Windows';
    else if (userAgent.includes('Mac OS')) os = 'Mac';
    else if (userAgent.includes('Linux')) os = 'Linux';

    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) browser = 'Chrome';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browser = 'Safari';
    else if (userAgent.includes('Edg')) browser = 'Edge';

    const prefix = userName ? `${userName}'s` : '';
    return `${prefix} ${os} (${browser})`.trim();
}

/**
 * POST /api/push/subscribe
 * Register a push subscription for the current user.
 * Auto-creates a NotificationDevice entry so the subscription
 * is immediately available for targeted notifications.
 * Body: { endpoint, keys: { p256dh, auth }, deviceLabel?: string }
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { endpoint, keys, deviceLabel } = body;

        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            return NextResponse.json(
                { error: 'Invalid subscription: endpoint and keys (p256dh, auth) are required' },
                { status: 400 }
            );
        }

        // Get user agent for device identification
        const userAgent = request.headers.get('user-agent') || undefined;

        // Upsert subscription (update if user already subscribed from this browser)
        const subscription = await db.pushSubscription.upsert({
            where: {
                userId_endpoint: {
                    userId: session.user.id,
                    endpoint,
                },
            },
            update: {
                p256dh: keys.p256dh,
                auth: keys.auth,
                userAgent,
            },
            create: {
                userId: session.user.id,
                organizationId: session.user.currentOrganizationId,
                endpoint,
                p256dh: keys.p256dh,
                auth: keys.auth,
                userAgent,
            },
        });

        // Auto-register a NotificationDevice if this subscription isn't linked to one yet
        const existingDevice = await db.notificationDevice.findFirst({
            where: { pushSubscriptionId: subscription.id },
        });

        let device = existingDevice;
        if (!existingDevice) {
            const label =
                deviceLabel?.trim() ||
                deriveDeviceLabel(userAgent, session.user.name);

            // Ensure label uniqueness within org by appending a number if needed
            let finalLabel = label;
            let attempt = 0;
            while (attempt < 10) {
                try {
                    device = await db.notificationDevice.create({
                        data: {
                            organizationId: session.user.currentOrganizationId,
                            label: finalLabel,
                            pushSubscriptionId: subscription.id,
                        },
                    });
                    break;
                } catch (err) {
                    const prismaErr = err as { code?: string };
                    if (prismaErr.code === 'P2002') {
                        attempt++;
                        finalLabel = `${label} (${attempt + 1})`;
                    } else {
                        throw err;
                    }
                }
            }
        }

        return NextResponse.json({
            success: true,
            subscriptionId: subscription.id,
            deviceId: device?.id ?? null,
            deviceLabel: device?.label ?? null,
        });
    } catch (error) {
        createRouteLogger('API', '/api/push/subscribe').error({ err: error }, 'Failed to save push subscription');
        return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
    }
}

/**
 * DELETE /api/push/subscribe
 * Unsubscribe from push notifications
 * Body: { endpoint }
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { endpoint } = body;

        if (!endpoint) {
            return NextResponse.json({ error: 'Endpoint is required' }, { status: 400 });
        }

        await db.pushSubscription.delete({
            where: {
                userId_endpoint: {
                    userId: session.user.id,
                    endpoint,
                },
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        createRouteLogger('API', '/api/push/subscribe').error({ err: error }, 'Failed to delete push subscription');
        return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 });
    }
}

/**
 * GET /api/push/subscribe
 * Check if current user has an active subscription
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const subscriptions = await db.pushSubscription.findMany({
            where: { userId: session.user.id },
            select: {
                id: true,
                userAgent: true,
                createdAt: true,
            },
        });

        return NextResponse.json({
            isSubscribed: subscriptions.length > 0,
            subscriptionCount: subscriptions.length,
            subscriptions,
        });
    } catch (error) {
        createRouteLogger('API', '/api/push/subscribe').error({ err: error }, 'Failed to check subscription status');
        return NextResponse.json({ error: 'Failed to check status' }, { status: 500 });
    }
}
