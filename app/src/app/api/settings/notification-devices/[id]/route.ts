/**
 * Notification Device by ID API
 * Update or delete a specific registered device
 *
 * Why: Allows admins to rename devices or unlink/re-link subscriptions
 */

import { NextRequest, NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/utils';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createRouteLogger } from '@/lib/logger';

const log = createRouteLogger('API', '/api/settings/notification-devices/[id]');

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
 * PATCH /api/settings/notification-devices/[id]
 * Update a device label or re-link to a different subscription
 * Body: { label?: string, pushSubscriptionId?: string | null }
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
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

        const { id } = await params;

        // Verify device belongs to this org
        const existing = await db.notificationDevice.findFirst({
            where: {
                id,
                organizationId: session.user.currentOrganizationId,
            },
        });
        if (!existing) {
            return NextResponse.json({ error: 'Device not found' }, { status: 404 });
        }

        const parseResult = await safeParseJson(request);
        if (!parseResult.ok) {
            return NextResponse.json({ error: parseResult.error }, { status: 400 });
        }
        const body = parseResult.data;
        const updates: Record<string, unknown> = {};

        if (body.label !== undefined) {
            const trimmedLabel = String(body.label).trim();
            if (trimmedLabel.length === 0) {
                return NextResponse.json(
                    { error: 'Device label cannot be empty' },
                    { status: 400 }
                );
            }
            updates.label = trimmedLabel;
        }

        if ('pushSubscriptionId' in body) {
            // Allow null to unlink, or a valid subscription ID to re-link
            if (body.pushSubscriptionId !== null) {
                const sub = await db.pushSubscription.findFirst({
                    where: {
                        id: body.pushSubscriptionId,
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
            updates.pushSubscriptionId = body.pushSubscriptionId;
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json(
                { error: 'No valid fields to update' },
                { status: 400 }
            );
        }

        const device = await db.notificationDevice.update({
            where: { id },
            data: updates,
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

        return NextResponse.json({ device });
    } catch (error) {
        const prismaError = error as { code?: string };
        if (prismaError.code === 'P2002') {
            return NextResponse.json(
                { error: 'A device with this label already exists' },
                { status: 409 }
            );
        }

        log.error({ err: error }, 'Failed to update notification device');
        return NextResponse.json({ error: 'Failed to update device' }, { status: 500 });
    }
}

/**
 * DELETE /api/settings/notification-devices/[id]
 * Remove a device from the registry (does not delete the underlying push subscription)
 */
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
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

        const { id } = await params;

        // Verify device belongs to this org
        const existing = await db.notificationDevice.findFirst({
            where: {
                id,
                organizationId: session.user.currentOrganizationId,
            },
        });
        if (!existing) {
            return NextResponse.json({ error: 'Device not found' }, { status: 404 });
        }

        await db.notificationDevice.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        log.error({ err: error }, 'Failed to delete notification device');
        return NextResponse.json({ error: 'Failed to delete device' }, { status: 500 });
    }
}
