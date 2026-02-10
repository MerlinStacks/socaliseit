/**
 * Notification Devices API
 * CRUD for organization-level device registry
 *
 * Why: Enables targeted push notifications to specific named devices
 * instead of broadcasting to all subscribed endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createRouteLogger } from '@/lib/logger';

const log = createRouteLogger('API', '/api/settings/notification-devices');

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

/**
 * GET /api/settings/notification-devices
 * List all registered devices for the current organization
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const devices = await db.notificationDevice.findMany({
            where: { organizationId: session.user.currentOrganizationId },
            include: {
                pushSubscription: {
                    select: {
                        id: true,
                        userAgent: true,
                        createdAt: true,
                        user: { select: { name: true, email: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ devices });
    } catch (error) {
        log.error({ err: error }, 'Failed to list notification devices');
        return NextResponse.json({ error: 'Failed to list devices' }, { status: 500 });
    }
}

/**
 * POST /api/settings/notification-devices
 * Register a new device label (optionally linked to a push subscription)
 * Body: { label: string, pushSubscriptionId?: string }
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const hasAccess = await checkAdminAccess(
            session.user.currentOrganizationId,
            session.user.id
        );
        if (!hasAccess) {
            return NextResponse.json(
                { error: 'Forbidden: Admin access required' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { label, pushSubscriptionId } = body;

        if (!label || typeof label !== 'string' || label.trim().length === 0) {
            return NextResponse.json(
                { error: 'Device label is required' },
                { status: 400 }
            );
        }

        const trimmedLabel = label.trim();

        // Verify push subscription belongs to this org (if provided)
        if (pushSubscriptionId) {
            const sub = await db.pushSubscription.findFirst({
                where: {
                    id: pushSubscriptionId,
                    organizationId: session.user.currentOrganizationId,
                },
            });
            if (!sub) {
                return NextResponse.json(
                    { error: 'Push subscription not found in this organization' },
                    { status: 400 }
                );
            }
        }

        const device = await db.notificationDevice.create({
            data: {
                organizationId: session.user.currentOrganizationId,
                label: trimmedLabel,
                pushSubscriptionId: pushSubscriptionId || null,
            },
            include: {
                pushSubscription: {
                    select: {
                        id: true,
                        userAgent: true,
                        createdAt: true,
                        user: { select: { name: true, email: true } },
                    },
                },
            },
        });

        return NextResponse.json({ device }, { status: 201 });
    } catch (error) {
        // Handle unique constraint violation
        const prismaError = error as { code?: string };
        if (prismaError.code === 'P2002') {
            return NextResponse.json(
                { error: 'A device with this label already exists' },
                { status: 409 }
            );
        }

        log.error({ err: error }, 'Failed to create notification device');
        return NextResponse.json({ error: 'Failed to create device' }, { status: 500 });
    }
}
