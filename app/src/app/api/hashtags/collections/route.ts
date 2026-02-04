/**
 * Hashtag Collections API Route
 * CRUD operations for saved hashtag groups
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * GET /api/hashtags/collections - List all hashtag collections for organization
 */
export async function GET() {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;

    const collections = await db.hashtagCollection.findMany({
        where: { organizationId },
        orderBy: { name: 'asc' },
    });

    return NextResponse.json({
        collections,
        total: collections.length
    });
}

/**
 * POST /api/hashtags/collections - Create a new hashtag collection
 */
export async function POST(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;
    const userId = session.user.id;
    const userName = session.user.name || 'Unknown';

    const body = await request.json();
    const { name, hashtags } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (!Array.isArray(hashtags) || hashtags.length === 0) {
        return NextResponse.json({ error: 'At least one hashtag is required' }, { status: 400 });
    }

    // Normalize hashtags: remove # prefix, trim, lowercase, filter empty
    const normalizedHashtags = hashtags
        .map((h: string) => h.replace(/^#/, '').trim().toLowerCase())
        .filter((h: string) => h.length > 0);

    if (normalizedHashtags.length === 0) {
        return NextResponse.json({ error: 'At least one valid hashtag is required' }, { status: 400 });
    }

    // Check for duplicate name
    const existing = await db.hashtagCollection.findUnique({
        where: { organizationId_name: { organizationId, name: name.trim() } }
    });

    if (existing) {
        return NextResponse.json({ error: 'A collection with this name already exists' }, { status: 400 });
    }

    const collection = await db.hashtagCollection.create({
        data: {
            organizationId,
            name: name.trim(),
            hashtags: normalizedHashtags,
        }
    });

    // Log activity
    await db.activity.create({
        data: {
            organizationId,
            userId,
            userName,
            action: 'created',
            resourceType: 'hashtag_collection',
            resourceId: collection.id,
            resourceName: collection.name
        }
    });

    return NextResponse.json(collection, { status: 201 });
}
