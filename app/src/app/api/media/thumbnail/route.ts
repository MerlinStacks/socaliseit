/**
 * Custom Thumbnail Upload API
 * Why: Handles base64 thumbnail images from frame picker and custom uploads
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'thumbnails');

/**
 * POST /api/media/thumbnail
 * Upload a custom thumbnail from base64 data URL or file
 * Body: { dataUrl: string } or FormData with 'file'
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Ensure upload directory exists
        if (!existsSync(UPLOAD_DIR)) {
            await mkdir(UPLOAD_DIR, { recursive: true });
        }

        const contentType = request.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            // Handle base64 data URL (from canvas frame capture)
            const { dataUrl } = await request.json();

            if (!dataUrl || typeof dataUrl !== 'string') {
                return NextResponse.json({ error: 'No data URL provided' }, { status: 400 });
            }

            // Validate data URL format
            const match = dataUrl.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
            if (!match) {
                return NextResponse.json({ error: 'Invalid data URL format' }, { status: 400 });
            }

            const [, format, base64Data] = match;
            const buffer = Buffer.from(base64Data, 'base64');

            // Generate unique filename
            const filename = `${randomUUID()}.${format === 'jpeg' ? 'jpg' : format}`;
            const filePath = path.join(UPLOAD_DIR, filename);

            await writeFile(filePath, buffer);

            return NextResponse.json({
                thumbnailUrl: `/api/uploads/thumbnails/${filename}`,
            }, { status: 201 });

        } else if (contentType.includes('multipart/form-data')) {
            // Handle file upload (custom thumbnail image)
            const formData = await request.formData();
            const file = formData.get('file') as File | null;

            if (!file) {
                return NextResponse.json({ error: 'No file provided' }, { status: 400 });
            }

            // Validate image type
            const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
            if (!allowedTypes.includes(file.type)) {
                return NextResponse.json({
                    error: `Invalid file type. Allowed: ${allowedTypes.join(', ')}`
                }, { status: 400 });
            }

            // Validate file size (5MB max for thumbnails)
            const MAX_SIZE = 5 * 1024 * 1024;
            if (file.size > MAX_SIZE) {
                return NextResponse.json({ error: 'File too large. Maximum 5MB for thumbnails.' }, { status: 400 });
            }

            // Generate unique filename
            const ext = path.extname(file.name) || '.jpg';
            const filename = `${randomUUID()}${ext}`;
            const filePath = path.join(UPLOAD_DIR, filename);

            // Write file to disk
            const bytes = await file.arrayBuffer();
            await writeFile(filePath, Buffer.from(bytes));

            return NextResponse.json({
                thumbnailUrl: `/api/uploads/thumbnails/${filename}`,
            }, { status: 201 });

        } else {
            return NextResponse.json({ error: 'Invalid content type' }, { status: 400 });
        }

    } catch (error) {
        logger.error({ error }, 'Failed to upload thumbnail');
        return NextResponse.json({ error: 'Failed to upload thumbnail' }, { status: 500 });
    }
}
