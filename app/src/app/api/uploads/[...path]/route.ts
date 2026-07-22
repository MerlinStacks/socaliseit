/**
 * Dynamic File Server for Uploaded Media
 * 
 * Why: Next.js standalone mode doesn't serve files added to /public after build.
 * This route dynamically serves files from the /public/uploads directory at runtime,
 * enabling uploaded media to be accessible in production Docker deployments.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createReadStream } from 'fs';
import { readFile, access, stat } from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import sharp from 'sharp';
import { logger } from '@/lib/logger';
import { parseByteRange } from '@/lib/media/byte-range';

// Allowed extensions to prevent serving arbitrary files
const ALLOWED_EXTENSIONS = new Set([
    '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg',
    '.mp4', '.mov', '.webm',
    '.mp3', '.wav', '.aac', '.m4a'
]);

// MIME type mapping
const MIME_TYPES: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.aac': 'audio/aac',
    '.m4a': 'audio/mp4',
};

// Cache headers (1 day for immutable content)
const CACHE_CONTROL = 'public, max-age=86400, immutable';

/**
 * GET /api/uploads/[...path]
 * Serves files from /public/uploads directory
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path: pathSegments } = await params;

    // Reconstruct file path
    const relativePath = pathSegments.join('/');

    // Security: Prevent path traversal attacks
    if (relativePath.includes('..') || relativePath.startsWith('/')) {
        return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    // Get file extension
    const ext = path.extname(relativePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
        return NextResponse.json({ error: 'File type not allowed' }, { status: 403 });
    }

    // Build absolute path to file
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    const filePath = path.join(uploadsDir, relativePath);

    // Security: Ensure resolved path is within uploads directory
    if (!filePath.startsWith(uploadsDir)) {
        return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    try {
        // Check file exists and is accessible
        await access(filePath);

        // Get file stats for content-length
        const stats = await stat(filePath);

        // Why: Google Business API only supports JPG/PNG — allow on-the-fly
        // conversion via ?format=jpeg so publishers can request a compatible format
        // without creating duplicate files on disk.
        const requestedFormat = request.nextUrl.searchParams.get('format');
        if (requestedFormat && ['jpeg', 'jpg', 'png'].includes(requestedFormat.toLowerCase())) {
            const fileBuffer = await readFile(filePath);
            const outFormat = requestedFormat.toLowerCase() === 'png' ? 'png' as const : 'jpeg' as const;
            const converted = await sharp(fileBuffer)
                .rotate()
                .toColorspace('srgb')
                .toFormat(outFormat, { quality: 95, ...(outFormat === 'jpeg' ? { progressive: true } : {}) })
                .toBuffer();
            return new NextResponse(new Uint8Array(converted), {
                status: 200,
                headers: {
                    'Content-Type': outFormat === 'png' ? 'image/png' : 'image/jpeg',
                    'Content-Length': converted.length.toString(),
                    'Cache-Control': CACHE_CONTROL,
                },
            });
        }

        // Determine MIME type
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const rangeHeader = request.headers.get('range');
        const range = rangeHeader ? parseByteRange(rangeHeader, stats.size) : null;

        if (rangeHeader && !range) {
            return new NextResponse(null, {
                status: 416,
                headers: {
                    'Content-Range': `bytes */${stats.size}`,
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': CACHE_CONTROL,
                },
            });
        }

        const start = range?.start ?? 0;
        const end = range?.end ?? stats.size - 1;
        const contentLength = end - start + 1;
        const fileStream = createReadStream(filePath, range ? { start, end } : undefined);
        const body = Readable.toWeb(fileStream) as ReadableStream;

        // Stream large media and honor the byte ranges required by browser video players.
        return new NextResponse(body, {
            status: range ? 206 : 200,
            headers: {
                'Content-Type': contentType,
                'Content-Length': contentLength.toString(),
                'Cache-Control': CACHE_CONTROL,
                'Accept-Ranges': 'bytes',
                ...(range ? { 'Content-Range': `bytes ${start}-${end}/${stats.size}` } : {}),
            },
        });
    } catch (error) {
        logger.debug({ relativePath, error }, 'File not found or inaccessible');
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
}
