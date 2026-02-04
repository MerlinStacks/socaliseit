/**
 * Audio Tracks API - CRUD operations for audio library
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const AUDIO_DIR = path.join(process.cwd(), 'public', 'uploads', 'audio');
const ALLOWED_TYPES = ['audio/mpeg', 'audio/wav', 'audio/aac', 'audio/x-m4a', 'audio/mp4'];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

/**
 * GET /api/audio/tracks
 * List audio tracks (mine or featured)
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const featured = searchParams.get('featured') === 'true';
        const mine = searchParams.get('mine') === 'true';
        const search = searchParams.get('search');

        const where: Record<string, unknown> = {};

        if (featured) {
            where.isFeatured = true;
        } else if (mine) {
            where.organizationId = session.user.currentOrganizationId;
        }

        if (search) {
            where.name = { contains: search, mode: 'insensitive' };
        }

        const tracks = await db.audioTrack.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 50,
        });

        return NextResponse.json({
            tracks: tracks.map(track => ({
                id: track.id,
                name: track.name,
                url: track.url,
                duration: track.duration,
                category: track.category,
                isFeatured: track.isFeatured,
            })),
        });

    } catch (error) {
        logger.error({ error }, 'Failed to fetch audio tracks');
        return NextResponse.json({ error: 'Failed to fetch tracks' }, { status: 500 });
    }
}

/**
 * POST /api/audio/tracks
 * Upload a new audio track
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const name = formData.get('name') as string | null;
        const category = formData.get('category') as string | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Validate file type
        if (!ALLOWED_TYPES.includes(file.type)) {
            return NextResponse.json({
                error: `Invalid file type. Allowed: MP3, WAV, AAC, M4A`,
            }, { status: 400 });
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({
                error: 'File too large. Maximum 20MB allowed.',
            }, { status: 400 });
        }

        // Ensure directory exists
        if (!existsSync(AUDIO_DIR)) {
            await mkdir(AUDIO_DIR, { recursive: true });
        }

        // Generate unique filename
        const ext = path.extname(file.name);
        const filename = `${randomUUID()}${ext}`;
        const filePath = path.join(AUDIO_DIR, filename);

        // Write file
        const bytes = await file.arrayBuffer();
        await writeFile(filePath, Buffer.from(bytes));

        // Create database record
        // Note: In production, you would extract actual duration using FFprobe
        const track = await db.audioTrack.create({
            data: {
                organizationId: session.user.currentOrganizationId,
                name: name || file.name.replace(/\.[^/.]+$/, ''),
                url: `/api/uploads/audio/${filename}`,
                duration: 30, // Default, would be extracted in production
                category: category || null,
                isFeatured: false,
            },
        });

        return NextResponse.json({
            id: track.id,
            name: track.name,
            url: track.url,
            duration: track.duration,
            category: track.category,
        }, { status: 201 });

    } catch (error) {
        logger.error({ error }, 'Failed to upload audio track');
        return NextResponse.json({ error: 'Failed to upload track' }, { status: 500 });
    }
}

/**
 * DELETE /api/audio/tracks
 * Delete an audio track
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'Track ID required' }, { status: 400 });
        }

        // Verify ownership
        const track = await db.audioTrack.findFirst({
            where: {
                id,
                organizationId: session.user.currentOrganizationId,
            },
        });

        if (!track) {
            return NextResponse.json({ error: 'Track not found' }, { status: 404 });
        }

        // Delete from database
        await db.audioTrack.delete({ where: { id } });

        return NextResponse.json({ success: true });

    } catch (error) {
        logger.error({ error }, 'Failed to delete audio track');
        return NextResponse.json({ error: 'Failed to delete track' }, { status: 500 });
    }
}
