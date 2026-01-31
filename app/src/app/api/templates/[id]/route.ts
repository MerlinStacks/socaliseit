/**
 * Single Template API Routes
 * GET, PUT, DELETE operations for individual templates
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * Extracts hashtags from a caption string
 * Why: Re-extract hashtags when caption is updated
 */
function extractHashtags(caption: string): string[] {
    const matches = caption.match(/#\w+/g);
    return matches ? matches.map((tag) => tag.toLowerCase()) : [];
}

/**
 * GET /api/templates/:id - Get a single template
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    const { id } = await params;

    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.user.currentWorkspaceId;

    const template = await db.captionTemplate.findFirst({
        where: { id, workspaceId },
    });

    if (!template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({
        id: template.id,
        name: template.name,
        caption: template.caption,
        hashtags: template.hashtags,
        category: template.category,
        usageCount: template.usageCount,
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
    });
}

/**
 * PUT /api/templates/:id - Update a template
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    const { id } = await params;

    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.user.currentWorkspaceId;

    // Check template exists and belongs to workspace
    const existing = await db.captionTemplate.findFirst({
        where: { id, workspaceId },
    });

    if (!existing) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, caption, category, incrementUsage } = body;

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json({ error: 'Invalid template name' }, { status: 400 });
        }

        // Check for duplicate name (if changing)
        if (name.trim() !== existing.name) {
            const duplicate = await db.captionTemplate.findUnique({
                where: { workspaceId_name: { workspaceId, name: name.trim() } },
            });
            if (duplicate) {
                return NextResponse.json(
                    { error: 'A template with this name already exists' },
                    { status: 409 }
                );
            }
        }
        updateData.name = name.trim();
    }

    if (caption !== undefined) {
        updateData.caption = caption;
        updateData.hashtags = extractHashtags(caption);
    }

    if (category !== undefined) {
        updateData.category = category || null;
    }

    if (incrementUsage === true) {
        updateData.usageCount = { increment: 1 };
    }

    const template = await db.captionTemplate.update({
        where: { id },
        data: updateData,
    });

    return NextResponse.json({
        id: template.id,
        name: template.name,
        caption: template.caption,
        hashtags: template.hashtags,
        category: template.category,
        usageCount: template.usageCount,
        updatedAt: template.updatedAt.toISOString(),
    });
}

/**
 * DELETE /api/templates/:id - Delete a template
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    const { id } = await params;

    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.user.currentWorkspaceId;
    const userId = session.user.id;
    const userName = session.user.name || 'Unknown';

    // Check template exists and belongs to workspace
    const template = await db.captionTemplate.findFirst({
        where: { id, workspaceId },
    });

    if (!template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    await db.captionTemplate.delete({ where: { id } });

    // Log activity
    await db.activity.create({
        data: {
            workspaceId,
            userId,
            userName,
            action: 'deleted',
            resourceType: 'template',
            resourceId: id,
            resourceName: template.name,
        },
    });

    return NextResponse.json({ success: true });
}
