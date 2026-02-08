/**
 * Media Folders API Routes
 * CRUD operations for organizing media into folders
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createRouteLogger } from '@/lib/logger';

/**
 * GET /api/media/folders
 * List all folders for the current workspace
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const folders = await db.mediaFolder.findMany({
            where: { organizationId: session.user.currentOrganizationId },
            include: { _count: { select: { media: true } } },
            orderBy: { name: 'asc' },
        });

        // Also get count of unfiled media (root)
        const unfiledCount = await db.media.count({
            where: {
                organizationId: session.user.currentOrganizationId,
                folderId: null,
            },
        });

        return NextResponse.json({
            folders: folders.map((f: { id: string; name: string; color: string | null; createdAt: Date; _count: { media: number } }) => ({
                id: f.id,
                name: f.name,
                color: f.color,
                mediaCount: f._count.media,
                createdAt: f.createdAt.toISOString(),
            })),
            unfiledCount,
        });
    } catch (error) {
        createRouteLogger('API', '/api/media/folders').error({ err: error }, 'Failed to fetch folders');
        return NextResponse.json({ error: 'Failed to fetch folders' }, { status: 500 });
    }
}

/**
 * POST /api/media/folders
 * Create a new folder
 * Body: { name: string, color?: string }
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { name, color } = await request.json();

        if (!name?.trim()) {
            return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
        }

        // Check for duplicate name
        const existing = await db.mediaFolder.findUnique({
            where: {
                organizationId_name: {
                    organizationId: session.user.currentOrganizationId,
                    name: name.trim(),
                },
            },
        });

        if (existing) {
            return NextResponse.json({ error: 'A folder with this name already exists' }, { status: 409 });
        }

        const folder = await db.mediaFolder.create({
            data: {
                organizationId: session.user.currentOrganizationId,
                name: name.trim(),
                color: color || '#6B7280',
            },
        });

        return NextResponse.json({
            id: folder.id,
            name: folder.name,
            color: folder.color,
            mediaCount: 0,
            createdAt: folder.createdAt.toISOString(),
        }, { status: 201 });
    } catch (error) {
        createRouteLogger('API', '/api/media/folders').error({ err: error }, 'Failed to create folder');
        return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 });
    }
}

/**
 * PUT /api/media/folders
 * Update a folder
 * Body: { id: string, name?: string, color?: string }
 */
export async function PUT(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id, name, color } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'Folder ID is required' }, { status: 400 });
        }

        // Verify folder belongs to workspace
        const existing = await db.mediaFolder.findFirst({
            where: { id, organizationId: session.user.currentOrganizationId },
        });

        if (!existing) {
            return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
        }

        // Check for name conflict if renaming
        if (name && name.trim() !== existing.name) {
            const conflict = await db.mediaFolder.findUnique({
                where: {
                    organizationId_name: {
                        organizationId: session.user.currentOrganizationId,
                        name: name.trim(),
                    },
                },
            });
            if (conflict) {
                return NextResponse.json({ error: 'A folder with this name already exists' }, { status: 409 });
            }
        }

        const folder = await db.mediaFolder.update({
            where: { id },
            data: {
                ...(name ? { name: name.trim() } : {}),
                ...(color ? { color } : {}),
            },
        });

        return NextResponse.json({
            id: folder.id,
            name: folder.name,
            color: folder.color,
            createdAt: folder.createdAt.toISOString(),
        });
    } catch (error) {
        createRouteLogger('API', '/api/media/folders').error({ err: error }, 'Failed to update folder');
        return NextResponse.json({ error: 'Failed to update folder' }, { status: 500 });
    }
}

/**
 * DELETE /api/media/folders
 * Delete a folder (media moves to root)
 * Body: { id: string }
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'Folder ID is required' }, { status: 400 });
        }

        // Verify folder belongs to workspace
        const existing = await db.mediaFolder.findFirst({
            where: { id, organizationId: session.user.currentOrganizationId },
        });

        if (!existing) {
            return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
        }

        // Delete folder (media folderId set to null due to onDelete: SetNull)
        await db.mediaFolder.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        createRouteLogger('API', '/api/media/folders').error({ err: error }, 'Failed to delete folder');
        return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 });
    }
}
