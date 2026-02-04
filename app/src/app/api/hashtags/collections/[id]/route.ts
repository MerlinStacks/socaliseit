/**
 * Hashtag Collection [id] API Route
 * Get, update, delete individual hashtag collections
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * GET /api/hashtags/collections/:id - Get single collection
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;
    const { id } = await params;

    const collection = await db.hashtagCollection.findFirst({
        where: { id, organizationId }
    });

    if (!collection) {
        return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    return NextResponse.json(collection);
}

/**
 * PUT /api/hashtags/collections/:id - Update collection
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;
    const userId = session.user.id;
    const userName = session.user.name || 'Unknown';
    const { id } = await params;

    // Verify collection belongs to organization
    const existing = await db.hashtagCollection.findFirst({
        where: { id, organizationId }
    });

    if (!existing) {
        return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, hashtags } = body;

    // Build update data
    const updateData: { name?: string; hashtags?: string[] } = {};

    if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
        }

        // Check for duplicate name (if changing)
        if (name.trim() !== existing.name) {
            const duplicate = await db.hashtagCollection.findUnique({
                where: { organizationId_name: { organizationId, name: name.trim() } }
            });
            if (duplicate) {
                return NextResponse.json({ error: 'A collection with this name already exists' }, { status: 400 });
            }
        }
        updateData.name = name.trim();
    }

    if (hashtags !== undefined) {
        if (!Array.isArray(hashtags) || hashtags.length === 0) {
            return NextResponse.json({ error: 'At least one hashtag is required' }, { status: 400 });
        }

        // Normalize hashtags
        const normalizedHashtags = hashtags
            .map((h: string) => h.replace(/^#/, '').trim().toLowerCase())
            .filter((h: string) => h.length > 0);

        if (normalizedHashtags.length === 0) {
            return NextResponse.json({ error: 'At least one valid hashtag is required' }, { status: 400 });
        }
        updateData.hashtags = normalizedHashtags;
    }

    const collection = await db.hashtagCollection.update({
        where: { id },
        data: updateData
    });

    // Log activity
    await db.activity.create({
        data: {
            organizationId,
            userId,
            userName,
            action: 'updated',
            resourceType: 'hashtag_collection',
            resourceId: collection.id,
            resourceName: collection.name
        }
    });

    return NextResponse.json(collection);
}

/**
 * DELETE /api/hashtags/collections/:id - Delete collection
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;
    const userId = session.user.id;
    const userName = session.user.name || 'Unknown';
    const { id } = await params;

    // Verify collection belongs to organization
    const collection = await db.hashtagCollection.findFirst({
        where: { id, organizationId }
    });

    if (!collection) {
        return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    await db.hashtagCollection.delete({ where: { id } });

    // Log activity
    await db.activity.create({
        data: {
            organizationId,
            userId,
            userName,
            action: 'deleted',
            resourceType: 'hashtag_collection',
            resourceId: id,
            resourceName: collection.name
        }
    });

    return NextResponse.json({ success: true });
}
