/**
 * Automations API Route
 * CRUD operations for DM automations
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * GET /api/automations - List automations for workspace
 */
export async function GET() {
    const session = await auth();

    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.user.currentWorkspaceId;

    const automations = await db.automation.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' }
    });

    const formattedAutomations = automations.map(auto => ({
        id: auto.id,
        name: auto.name,
        trigger: auto.trigger,
        platform: auto.platform.toLowerCase(),
        message: auto.message,
        isActive: auto.isActive,
        stats: {
            triggered: auto.triggered,
            delivered: auto.delivered,
            responseRate: auto.triggered > 0
                ? Math.round((auto.delivered / auto.triggered) * 100)
                : 0
        },
        createdAt: auto.createdAt.toISOString()
    }));

    return NextResponse.json({
        automations: formattedAutomations,
        total: automations.length
    });
}

/**
 * POST /api/automations - Create a new automation
 */
export async function POST(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.user.currentWorkspaceId;
    const userId = session.user.id;
    const userName = session.user.name || 'Unknown';

    const body = await request.json();
    const { name, trigger, platform, message } = body;

    if (!name || !trigger || !platform || !message) {
        return NextResponse.json({
            error: 'Name, trigger, platform, and message are required'
        }, { status: 400 });
    }

    const validPlatforms = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'YOUTUBE', 'PINTEREST', 'GOOGLE_BUSINESS'];
    const platformUpper = platform.toUpperCase();

    if (!validPlatforms.includes(platformUpper)) {
        return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }

    const automation = await db.automation.create({
        data: {
            workspaceId,
            name,
            trigger,
            platform: platformUpper,
            message,
            isActive: true
        }
    });

    // Log activity
    await db.activity.create({
        data: {
            workspaceId,
            userId,
            userName,
            action: 'created',
            resourceType: 'automation',
            resourceId: automation.id,
            resourceName: automation.name
        }
    });

    return NextResponse.json({
        id: automation.id,
        name: automation.name,
        trigger: automation.trigger,
        platform: automation.platform.toLowerCase(),
        message: automation.message,
        isActive: automation.isActive,
        stats: { triggered: 0, delivered: 0, responseRate: 0 }
    }, { status: 201 });
}

/**
 * PATCH /api/automations - Update automation (toggle active, edit)
 */
export async function PATCH(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.user.currentWorkspaceId;

    const body = await request.json();
    const { id, isActive, name, trigger, message } = body;

    if (!id) {
        return NextResponse.json({ error: 'Automation ID is required' }, { status: 400 });
    }

    // Verify automation belongs to workspace
    const automation = await db.automation.findFirst({
        where: { id, workspaceId }
    });

    if (!automation) {
        return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (typeof isActive === 'boolean') updateData.isActive = isActive;
    if (name) updateData.name = name;
    if (trigger) updateData.trigger = trigger;
    if (message) updateData.message = message;

    const updated = await db.automation.update({
        where: { id },
        data: updateData
    });

    return NextResponse.json({
        id: updated.id,
        name: updated.name,
        trigger: updated.trigger,
        platform: updated.platform.toLowerCase(),
        message: updated.message,
        isActive: updated.isActive
    });
}

/**
 * DELETE /api/automations - Delete automation
 */
export async function DELETE(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.user.currentWorkspaceId;
    const userId = session.user.id;
    const userName = session.user.name || 'Unknown';

    const { searchParams } = new URL(request.url);
    const automationId = searchParams.get('id');

    if (!automationId) {
        return NextResponse.json({ error: 'Automation ID is required' }, { status: 400 });
    }

    // Verify automation belongs to workspace
    const automation = await db.automation.findFirst({
        where: { id: automationId, workspaceId }
    });

    if (!automation) {
        return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    }

    await db.automation.delete({ where: { id: automationId } });

    // Log activity
    await db.activity.create({
        data: {
            workspaceId,
            userId,
            userName,
            action: 'deleted',
            resourceType: 'automation',
            resourceId: automationId,
            resourceName: automation.name
        }
    });

    return NextResponse.json({ success: true });
}
