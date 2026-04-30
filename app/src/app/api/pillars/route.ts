/**
 * Content Pillars API Route
 * CRUD operations for content pillars
 */

import { NextRequest, NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/utils';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * GET /api/pillars - List content pillars for workspace
 */
export async function GET() {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;

    const pillars = await db.contentPillar.findMany({
        where: { organizationId },
        orderBy: { name: 'asc' },
        include: {
            _count: {
                select: { posts: true }
            }
        }
    });

    // Calculate stats for each pillar
    const totalPosts = pillars.reduce((sum, p) => sum + p._count.posts, 0);

    const pillarsWithStats = pillars.map(pillar => ({
        id: pillar.id,
        name: pillar.name,
        description: pillar.description,
        color: pillar.color,
        icon: pillar.icon,
        posts: pillar._count.posts,
        percentage: totalPosts > 0
            ? Math.round((pillar._count.posts / totalPosts) * 100)
            : 0
    }));

    return NextResponse.json({
        pillars: pillarsWithStats,
        total: pillars.length
    });
}

/**
 * POST /api/pillars - Create a new content pillar
 */
export async function POST(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;
    const userId = session.user.id;
    const userName = session.user.name || 'Unknown';

    const parseResult = await safeParseJson(request);
    if (!parseResult.ok) {
        return NextResponse.json({ error: parseResult.error }, { status: 400 });
    }
    const body = parseResult.data;
    const { name, description, color, icon } = body;

    if (!name || typeof name !== 'string') {
        return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Check for duplicate name
    const existing = await db.contentPillar.findUnique({
        where: { organizationId_name: { organizationId, name } }
    });

    if (existing) {
        return NextResponse.json({ error: 'A pillar with this name already exists' }, { status: 400 });
    }

    const pillar = await db.contentPillar.create({
        data: {
            organizationId,
            name: name as string,
            description: (description || null) as string | null,
            color: (color || '#D4A574') as string,
            icon: (icon || null) as string | null
        }
    });

    // Log activity
    await db.activity.create({
        data: {
            organizationId,
            userId,
            userName,
            action: 'created',
            resourceType: 'pillar',
            resourceId: pillar.id,
            resourceName: pillar.name
        }
    });

    return NextResponse.json(pillar, { status: 201 });
}

/**
 * DELETE /api/pillars - Delete a content pillar
 */
export async function DELETE(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;
    const userId = session.user.id;
    const userName = session.user.name || 'Unknown';

    const { searchParams } = new URL(request.url);
    const pillarId = searchParams.get('id');

    if (!pillarId) {
        return NextResponse.json({ error: 'Pillar ID is required' }, { status: 400 });
    }

    // Verify pillar belongs to workspace
    const pillar = await db.contentPillar.findFirst({
        where: { id: pillarId, organizationId }
    });

    if (!pillar) {
        return NextResponse.json({ error: 'Pillar not found' }, { status: 404 });
    }

    await db.contentPillar.delete({ where: { id: pillarId } });

    // Log activity
    await db.activity.create({
        data: {
            organizationId,
            userId,
            userName,
            action: 'deleted',
            resourceType: 'pillar',
            resourceId: pillarId,
            resourceName: pillar.name
        }
    });

    return NextResponse.json({ success: true });
}
