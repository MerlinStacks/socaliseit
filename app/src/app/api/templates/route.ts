/**
 * Templates API Routes
 * CRUD operations for saved caption/hashtag templates
 */

import { NextRequest, NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/utils';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * Extracts hashtags from a caption string
 * Why: Pre-extract hashtags for quick display in template picker
 */
function extractHashtags(caption: string): string[] {
    const matches = caption.match(/#\w+/g);
    return matches ? matches.map((tag) => tag.toLowerCase()) : [];
}

/**
 * GET /api/templates - List all templates for current workspace
 * Query params: category (optional filter)
 */
export async function GET(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    const where: Record<string, unknown> = { organizationId };
    if (category) {
        where.category = category;
    }

    const templates = await db.captionTemplate.findMany({
        where,
        orderBy: [{ usageCount: 'desc' }, { updatedAt: 'desc' }],
        select: {
            id: true,
            name: true,
            caption: true,
            hashtags: true,
            category: true,
            usageCount: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    return NextResponse.json({ templates });
}

/**
 * POST /api/templates - Create a new template
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
    const { name, caption, category } = body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json({ error: 'Template name is required' }, { status: 400 });
    }

    if (!caption || typeof caption !== 'string') {
        return NextResponse.json({ error: 'Caption is required' }, { status: 400 });
    }

    // Check for duplicate name
    const existing = await db.captionTemplate.findUnique({
        where: { organizationId_name: { organizationId, name: name.trim() } },
    });

    if (existing) {
        return NextResponse.json(
            { error: 'A template with this name already exists' },
            { status: 409 }
        );
    }

    // Extract hashtags from caption
    const hashtags = extractHashtags(caption);

    const template = await db.captionTemplate.create({
        data: {
            organizationId,
            name: name.trim(),
            caption,
            hashtags,
            category: category || null,
        },
    });

    // Log activity
    await db.activity.create({
        data: {
            organizationId,
            userId,
            userName,
            action: 'created',
            resourceType: 'template',
            resourceId: template.id,
            resourceName: template.name,
        },
    });

    return NextResponse.json(
        {
            id: template.id,
            name: template.name,
            caption: template.caption,
            hashtags: template.hashtags,
            category: template.category,
            createdAt: template.createdAt.toISOString(),
        },
        { status: 201 }
    );
}
