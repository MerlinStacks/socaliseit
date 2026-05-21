/**
 * User Avatar Upload API
 * Why: Dedicated lightweight route for profile avatar changes.
 * Saves to public/uploads/avatars/ and updates User.image in DB.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth, invalidateSessionCache } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { checkRateLimit, createRateLimitHeaders, EXPENSIVE_RATE_LIMIT } from '@/lib/rate-limit';

const AVATAR_DIR = path.join(process.cwd(), 'public', 'uploads', 'avatars');
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
const MAX_DIMENSION = 400; // px — avatars don't need to be huge

/**
 * POST /api/user/avatar
 * Upload or replace user avatar
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const rateLimitResult = await checkRateLimit(`${session.user.id}:avatar-upload`, EXPENSIVE_RATE_LIMIT);
        if (!rateLimitResult.allowed) {
            return NextResponse.json(
                { error: 'Too many avatar upload attempts. Please try again later.' },
                { status: 429, headers: createRateLimitHeaders(rateLimitResult) }
            );
        }

        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Validate type
        let mimeType = file.type;
        if (!mimeType) {
            const ext = path.extname(file.name).toLowerCase();
            const mimeMap: Record<string, string> = {
                '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
                '.webp': 'image/webp', '.gif': 'image/gif',
            };
            mimeType = mimeMap[ext] || '';
        }
        if (!ALLOWED_TYPES.includes(mimeType)) {
            return NextResponse.json({ error: 'Only JPG, PNG, GIF, or WebP images are allowed' }, { status: 400 });
        }

        // Validate size
        if (file.size > MAX_SIZE) {
            return NextResponse.json({ error: 'File too large. Maximum 5 MB allowed.' }, { status: 400 });
        }

        // Ensure avatars directory exists
        if (!existsSync(AVATAR_DIR)) {
            await mkdir(AVATAR_DIR, { recursive: true });
        }

        // Read file into buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Optimize with sharp: auto-rotate, sRGB, resize, output as JPEG (or PNG if input was PNG)
        const isGif = mimeType === 'image/gif';
        let outputBuffer: Buffer;
        let outputExt: string;

        if (isGif) {
            // GIFs: just pass through (preserves animation)
            outputBuffer = buffer;
            outputExt = '.gif';
        } else {
            const outputFormat = mimeType === 'image/png' ? 'png' as const : 'jpeg' as const;
            outputExt = outputFormat === 'png' ? '.png' : '.jpg';

            outputBuffer = await sharp(buffer)
                .rotate()
                .toColorspace('srgb')
                .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'cover', position: 'centre' })
                .toFormat(outputFormat, {
                    quality: 90,
                    ...(outputFormat === 'jpeg' ? { progressive: true } : {}),
                })
                .toBuffer();
        }

        // Generate unique filename
        const uniqueName = `${randomUUID()}${outputExt}`;
        const filePath = path.join(AVATAR_DIR, uniqueName);
        const avatarUrl = `/api/uploads/avatars/${uniqueName}`;

        // Write optimized avatar to disk
        const { writeFile } = await import('fs/promises');
        await writeFile(filePath, outputBuffer);

        // Fetch current user to get old avatar path (for cleanup)
        const currentUser = await db.user.findUnique({
            where: { id: session.user.id },
            select: { image: true },
        });

        // Update user record
        await db.user.update({
            where: { id: session.user.id },
            data: { image: avatarUrl },
        });

        // Invalidate session cache so the new avatar shows immediately
        invalidateSessionCache(session.user.id);

        // Clean up old avatar file (if it was a local upload, not an OAuth avatar)
        if (currentUser?.image?.startsWith('/api/uploads/avatars/')) {
            const oldFilename = path.basename(currentUser.image);
            const oldPath = path.join(AVATAR_DIR, oldFilename);
            try { await unlink(oldPath); } catch { /* file may not exist */ }
        }

        logger.info({ userId: session.user.id, avatarUrl }, 'User avatar updated');

        return NextResponse.json({ url: avatarUrl });
    } catch (error) {
        logger.error({ error }, 'Failed to upload avatar');
        return NextResponse.json({ error: 'Failed to upload avatar' }, { status: 500 });
    }
}

/**
 * DELETE /api/user/avatar
 * Remove user avatar (revert to initials)
 */
export async function DELETE() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch current avatar
        const currentUser = await db.user.findUnique({
            where: { id: session.user.id },
            select: { image: true },
        });

        // Clear image in DB
        await db.user.update({
            where: { id: session.user.id },
            data: { image: null },
        });

        // Invalidate session cache
        invalidateSessionCache(session.user.id);

        // Clean up file if it was a local upload
        if (currentUser?.image?.startsWith('/api/uploads/avatars/')) {
            const oldFilename = path.basename(currentUser.image);
            const oldPath = path.join(AVATAR_DIR, oldFilename);
            try { await unlink(oldPath); } catch { /* file may not exist */ }
        }

        logger.info({ userId: session.user.id }, 'User avatar removed');

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error({ error }, 'Failed to remove avatar');
        return NextResponse.json({ error: 'Failed to remove avatar' }, { status: 500 });
    }
}
