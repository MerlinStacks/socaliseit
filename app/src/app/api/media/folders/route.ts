/**
 * Media Folders API Routes
 * CRUD operations for organizing media into folders
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * GET /api/media/folders
 * List all folders for the current workspace
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const folders = await db.mediaFolder.findMany({
            where: { workspaceId: session.user.currentWorkspaceId },
            include: { _count: { select: { media: true } } },
            orderBy: { name: 'asc' },
        });

        // Also get count of unfiled media (root)
        const unfiledCount = await db.media.count({
            where: {
                workspaceId: session.user.currentWorkspaceId,
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
        console.error('Failed to fetch folders:', error);
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
        if (!session?.user?.id || !session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { name, color } = await request.json();

        if (!name?.trim()) {
            return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
        }

        // Check for duplicate name
        const existing = await db.mediaFolder.findUnique({
            where: {
                workspaceId_name: {
                    workspaceId: session.user.currentWorkspaceId,
                    name: name.trim(),
                },
            },
        });

        if (existing) {
            return NextResponse.json({ error: 'A folder with this name already exists' }, { status: 409 });
        }

        const folder = await db.mediaFolder.create({
            data: {
                workspaceId: session.user.currentWorkspaceId,
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
        console.error('Failed to create folder:', error);
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
        if (!session?.user?.id || !session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id, name, color } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'Folder ID is required' }, { status: 400 });
        }

        // Verify folder belongs to workspace
        const existing = await db.mediaFolder.findFirst({
            where: { id, workspaceId: session.user.currentWorkspaceId },
        });

        if (!existing) {
            return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
        }

        // Check for name conflict if renaming
        if (name && name.trim() !== existing.name) {
            const conflict = await db.mediaFolder.findUnique({
                where: {
                    workspaceId_name: {
                        workspaceId: session.user.currentWorkspaceId,
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
        console.error('Failed to update folder:', error);
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
        if (!session?.user?.id || !session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'Folder ID is required' }, { status: 400 });
        }

        // Verify folder belongs to workspace
        const existing = await db.mediaFolder.findFirst({
            where: { id, workspaceId: session.user.currentWorkspaceId },
        });

        if (!existing) {
            return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
        }

        // Delete folder (media folderId set to null due to onDelete: SetNull)
        await db.mediaFolder.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete folder:', error);
        return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 });
    }
}
