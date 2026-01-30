/**
 * Push Subscription API
 * Subscribe/unsubscribe from push notifications
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * POST /api/push/subscribe
 * Register a push subscription for the current user
 * Body: { endpoint, keys: { p256dh, auth } }
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { endpoint, keys } = body;

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
                workspaceId: session.user.currentWorkspaceId,
                endpoint,
                p256dh: keys.p256dh,
                auth: keys.auth,
                userAgent,
            },
        });

        return NextResponse.json({
            success: true,
            subscriptionId: subscription.id,
        });
    } catch (error) {
        console.error('Failed to save push subscription:', error);
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
        console.error('Failed to delete push subscription:', error);
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
        if (!session?.user?.id || !session?.user?.currentWorkspaceId) {
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
        console.error('Failed to check subscription status:', error);
        return NextResponse.json({ error: 'Failed to check status' }, { status: 500 });
    }
}
