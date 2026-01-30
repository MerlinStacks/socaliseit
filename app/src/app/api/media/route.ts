/**
 * Media API Routes
 * Upload, list, and delete media files with workspace isolation
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

/**
 * Route Segment Config
 * Why needed: Next.js default body size limit is 1MB, which is too small for video uploads.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for large file processing

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
const ALLOWED_TYPES = [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/quicktime',
    'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/x-m4a', 'audio/mp4'
];
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

/**
 * GET /api/media
 * List media files for the current workspace
 * Supports filtering by folder, type, search, and pagination
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const folderId = searchParams.get('folderId');
        const type = searchParams.get('type'); // 'image' | 'video' | 'all'
        const search = searchParams.get('search');
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');

        // Build where clause with workspace isolation
        const where: Record<string, unknown> = {
            workspaceId: session.user.currentWorkspaceId,
        };

        // Folder filter: null means root (unfiled), undefined means all
        if (folderId === 'root') {
            where.folderId = null;
        } else if (folderId) {
            where.folderId = folderId;
        }

        // Type filter
        if (type === 'image') {
            where.mimeType = { startsWith: 'image/' };
        } else if (type === 'video') {
            where.mimeType = { startsWith: 'video/' };
        } else if (type === 'audio') {
            where.mimeType = { startsWith: 'audio/' };
        }

        // Search filter
        if (search) {
            where.OR = [
                { filename: { contains: search, mode: 'insensitive' } },
                { tags: { has: search.toLowerCase() } },
            ];
        }

        const [media, total] = await Promise.all([
            db.media.findMany({
                where,
                include: { folder: { select: { id: true, name: true, color: true } } },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset,
            }),
            db.media.count({ where }),
        ]);

        return NextResponse.json({
            media: media.map((m: { id: string; filename: string; url: string; thumbnailUrl: string | null; mimeType: string; size: number; width: number | null; height: number | null; duration: number | null; tags: string[]; createdAt: Date; folder: { id: string; name: string; color: string } | null }) => ({
                id: m.id,
                filename: m.filename,
                url: m.url,
                thumbnailUrl: m.thumbnailUrl,
                type: m.mimeType.startsWith('video/') ? 'video' : m.mimeType.startsWith('audio/') ? 'audio' : 'image',
                mimeType: m.mimeType,
                size: m.size,
                dimensions: m.width && m.height ? { width: m.width, height: m.height } : null,
                duration: m.duration,
                tags: m.tags,
                folder: m.folder,
                createdAt: m.createdAt.toISOString(),
            })),
            total,
            limit,
            offset,
        });
    } catch (error) {
        console.error('Failed to fetch media:', error);
        return NextResponse.json({ error: 'Failed to fetch media' }, { status: 500 });
    }
}

/**
 * POST /api/media
 * Upload a new media file
 */
export async function POST(request: NextRequest) {
    console.log('POST /api/media - Started');
    try {
        const session = await auth();
        console.log('POST /api/media - Auth completed', {
            userId: session?.user?.id,
            workspaceId: session?.user?.currentWorkspaceId
        });

        if (!session?.user?.id || !session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('POST /api/media - Parsing FormData...');
        let formData;
        try {
            formData = await request.formData();
        } catch (e) {
            console.error('POST /api/media - FormData parsing failed:', e);
            throw new Error(`Failed to parse upload data: ${e instanceof Error ? e.message : String(e)}`);
        }

        const file = formData.get('file') as File | null;
        const folderId = formData.get('folderId') as string | null;
        const tagsRaw = formData.get('tags') as string | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Log file details for debugging
        console.log('Upload attempt:', {
            name: file.name,
            type: file.type,
            size: file.size,
        });

        // Validate file type - handle empty/missing mime type
        let mimeType = file.type;
        if (!mimeType) {
            // Infer mime type from extension as fallback
            const ext = path.extname(file.name).toLowerCase();
            const mimeMap: Record<string, string> = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.webp': 'image/webp',
                '.gif': 'image/gif',
                '.mp4': 'video/mp4',
                '.mov': 'video/quicktime',
                '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav',
                '.m4a': 'audio/x-m4a',
                '.aac': 'audio/aac',
            };
            mimeType = mimeMap[ext] || '';
            console.log(`Inferred mime type from extension ${ext}: ${mimeType}`);
        }

        if (!mimeType || !ALLOWED_TYPES.includes(mimeType)) {
            return NextResponse.json(
                { error: `Invalid file type '${mimeType || 'unknown'}'. Allowed: ${ALLOWED_TYPES.join(', ')}` },
                { status: 400 }
            );
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: 'File too large. Maximum 50MB allowed.' },
                { status: 400 }
            );
        }

        // Validate folder belongs to workspace if provided
        if (folderId) {
            const folder = await db.mediaFolder.findFirst({
                where: { id: folderId, workspaceId: session.user.currentWorkspaceId },
            });
            if (!folder) {
                return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
            }
        }

        // Ensure upload directory exists
        if (!existsSync(UPLOAD_DIR)) {
            await mkdir(UPLOAD_DIR, { recursive: true });
        }

        // Generate unique filename to prevent collisions
        const ext = path.extname(file.name);
        const uniqueName = `${randomUUID()}${ext}`;
        const filePath = path.join(UPLOAD_DIR, uniqueName);

        // Write file to disk
        const bytes = await file.arrayBuffer();
        await writeFile(filePath, Buffer.from(bytes));

        // Parse tags
        const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) : [];

        // Create database record
        const mediaItem = await db.media.create({
            data: {
                workspaceId: session.user.currentWorkspaceId,
                folderId: folderId || null,
                filename: file.name,
                mimeType: mimeType,
                size: file.size,
                url: `/uploads/${uniqueName}`,
                thumbnailUrl: mimeType.startsWith('image/') ? `/uploads/${uniqueName}` : null,
                tags,
            },
            include: { folder: { select: { id: true, name: true, color: true } } },
        });

        return NextResponse.json({
            id: mediaItem.id,
            filename: mediaItem.filename,
            url: mediaItem.url,
            thumbnailUrl: mediaItem.thumbnailUrl,
            type: mediaItem.mimeType.startsWith('video/') ? 'video' : mediaItem.mimeType.startsWith('audio/') ? 'audio' : 'image',
            mimeType: mediaItem.mimeType,
            size: mediaItem.size,
            tags: mediaItem.tags,
            folder: mediaItem.folder,
            createdAt: mediaItem.createdAt.toISOString(),
        }, { status: 201 });
    } catch (error) {
        console.error('Failed to upload media:', error);
        // Return more specific error message if available
        const errorMessage = error instanceof Error ? error.message : 'Failed to upload media';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}

/**
 * PATCH /api/media
 * Update media metadata (filename, tags, folder)
 * Body: { id: string, filename?: string, tags?: string[], folderId?: string | null }
 */
export async function PATCH(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { id, filename, tags, folderId } = body;

        if (!id) {
            return NextResponse.json({ error: 'Media ID is required' }, { status: 400 });
        }

        // Verify media belongs to current workspace
        const existingMedia = await db.media.findFirst({
            where: {
                id,
                workspaceId: session.user.currentWorkspaceId,
            },
        });

        if (!existingMedia) {
            return NextResponse.json({ error: 'Media not found' }, { status: 404 });
        }

        // Build update data
        const updateData: Record<string, unknown> = {};

        if (filename !== undefined) {
            if (typeof filename !== 'string' || filename.trim().length === 0) {
                return NextResponse.json({ error: 'Filename cannot be empty' }, { status: 400 });
            }
            updateData.filename = filename.trim();
        }

        if (tags !== undefined) {
            if (!Array.isArray(tags)) {
                return NextResponse.json({ error: 'Tags must be an array' }, { status: 400 });
            }
            updateData.tags = tags.map((t: string) => String(t).trim().toLowerCase()).filter(Boolean);
        }

        // Handle folder assignment (null = unfiled, string = folder ID)
        if (folderId !== undefined) {
            if (folderId === null || folderId === '') {
                updateData.folderId = null;
            } else {
                // Validate folder belongs to workspace
                const folder = await db.mediaFolder.findFirst({
                    where: { id: folderId, workspaceId: session.user.currentWorkspaceId },
                });
                if (!folder) {
                    return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
                }
                updateData.folderId = folderId;
            }
        }

        // Update media record
        const updatedMedia = await db.media.update({
            where: { id },
            data: updateData,
            include: { folder: { select: { id: true, name: true, color: true } } },
        });

        return NextResponse.json({
            id: updatedMedia.id,
            filename: updatedMedia.filename,
            url: updatedMedia.url,
            thumbnailUrl: updatedMedia.thumbnailUrl,
            type: updatedMedia.mimeType.startsWith('video/') ? 'video' : 'image',
            mimeType: updatedMedia.mimeType,
            size: updatedMedia.size,
            dimensions: updatedMedia.width && updatedMedia.height
                ? { width: updatedMedia.width, height: updatedMedia.height }
                : null,
            duration: updatedMedia.duration,
            tags: updatedMedia.tags,
            folder: updatedMedia.folder,
            createdAt: updatedMedia.createdAt.toISOString(),
        });
    } catch (error) {
        console.error('Failed to update media:', error);
        return NextResponse.json({ error: 'Failed to update media' }, { status: 500 });
    }
}

/**
 * DELETE /api/media
 * Delete one or more media files
 * Body: { ids: string[] }
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { ids } = await request.json();

        if (!Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ error: 'No media IDs provided' }, { status: 400 });
        }

        // Fetch media items to get file paths (with workspace isolation)
        const mediaItems = await db.media.findMany({
            where: {
                id: { in: ids },
                workspaceId: session.user.currentWorkspaceId,
            },
        });

        if (mediaItems.length === 0) {
            return NextResponse.json({ error: 'No matching media found' }, { status: 404 });
        }

        // Delete files from disk
        const deletePromises = mediaItems.map(async (item: { id: string; url: string }) => {
            const filename = path.basename(item.url);
            const filePath = path.join(UPLOAD_DIR, filename);
            try {
                await unlink(filePath);
            } catch {
                // File may already be deleted or not exist
                console.warn(`Could not delete file: ${filePath}`);
            }
        });
        await Promise.all(deletePromises);

        // Delete database records
        await db.media.deleteMany({
            where: {
                id: { in: mediaItems.map((m: { id: string }) => m.id) },
            },
        });

        return NextResponse.json({
            success: true,
            deleted: mediaItems.length,
        });
    } catch (error) {
        console.error('Failed to delete media:', error);
        return NextResponse.json({ error: 'Failed to delete media' }, { status: 500 });
    }
}
