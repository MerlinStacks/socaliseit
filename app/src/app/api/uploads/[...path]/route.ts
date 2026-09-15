/**
 * Dynamic File Server for Uploaded Media
 * 
 * Why: Next.js standalone mode doesn't serve files added to /public after build.
 * This route dynamically serves files from the /public/uploads directory at runtime,
 * enabling uploaded media to be accessible in production Docker deployments.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { ReadStream } from 'fs';
import { open, type FileHandle } from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import sharp from 'sharp';
import { logger } from '@/lib/logger';
import { parseByteRange } from '@/lib/media/byte-range';

export const runtime = 'nodejs';

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
    context: { params: Promise<{ path: string[] }> }
) {
    return serve(request, context, request.method === 'HEAD');
}

export async function HEAD(
    request: NextRequest,
    context: { params: Promise<{ path: string[] }> }
) {
    return serve(request, context, true);
}

async function serve(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> },
    head: boolean
) {
    request.signal.throwIfAborted();
    const { path: pathSegments } = await params;
    request.signal.throwIfAborted();
    const jsonError = (error: string, status: number) => head
        ? new NextResponse(null, { status })
        : NextResponse.json({ error }, { status });

    // Reconstruct file path
    const relativePath = pathSegments.join('/');

    // Security: Prevent path traversal attacks
    if (relativePath.includes('..') || relativePath.startsWith('/')) {
        return jsonError('Invalid path', 400);
    }

    // Get file extension
    const ext = path.extname(relativePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
        return jsonError('File type not allowed', 403);
    }

    // Build absolute path to file
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    const filePath = path.join(uploadsDir, relativePath);

    // Security: Ensure resolved path is within uploads directory
    if (!filePath.startsWith(uploadsDir)) {
        return jsonError('Invalid path', 400);
    }

    let handle: FileHandle | undefined;
    let fileStream: ReadStream | undefined;
    let streaming = false;
    // Never log user-controlled paths, query strings, or filesystem error messages.
    const logContext = { route: '/api/uploads/[...path]', method: head ? 'HEAD' : 'GET', extension: ext };
    try {
        handle = await open(filePath, 'r');
        request.signal.throwIfAborted();
        const stats = await handle.stat();
        request.signal.throwIfAborted();
        if (!stats.isFile()) return jsonError('File not found', 404);

        // Why: Google Business API only supports JPG/PNG — allow on-the-fly
        // conversion via ?format=jpeg so publishers can request a compatible format
        // without creating duplicate files on disk.
        const requestedFormat = request.nextUrl.searchParams.get('format');
        if (requestedFormat && ['jpeg', 'jpg', 'png'].includes(requestedFormat.toLowerCase())) {
            const fileBuffer = await handle.readFile({ signal: request.signal });
            request.signal.throwIfAborted();
            const outFormat = requestedFormat.toLowerCase() === 'png' ? 'png' as const : 'jpeg' as const;
            const converted = await sharp(fileBuffer)
                .rotate()
                .toColorspace('srgb')
                .toFormat(outFormat, { quality: 95, ...(outFormat === 'jpeg' ? { progressive: true } : {}) })
                .toBuffer();
            request.signal.throwIfAborted();
            return new NextResponse(head ? null : new Uint8Array(converted), {
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
        let body: ReadableStream | null = null;
        request.signal.throwIfAborted();
        if (!head) {
            // The stream owns this same descriptor, closing it on EOF, abort, or cancellation.
            fileStream = handle.createReadStream({
                ...(range ? { start, end } : {}),
                autoClose: true,
                signal: request.signal,
            });
            fileStream.on('error', (error: NodeJS.ErrnoException) => {
                if (error.code !== 'ABORT_ERR') {
                    logger.error({ ...logContext, code: error.code }, 'Upload response stream failed');
                }
            });
            body = Readable.toWeb(fileStream) as ReadableStream;
        }

        // Stream large media and honor the byte ranges required by browser video players.
        const response = new NextResponse(body, {
            status: range ? 206 : 200,
            headers: {
                'Content-Type': contentType,
                'Content-Length': contentLength.toString(),
                'Cache-Control': CACHE_CONTROL,
                'Accept-Ranges': 'bytes',
                ...(range ? { 'Content-Range': `bytes ${start}-${end}/${stats.size}` } : {}),
            },
        });
        streaming = !!fileStream;
        return response;
    } catch (error) {
        request.signal.throwIfAborted();
        const code = (error as NodeJS.ErrnoException)?.code;
        logger.debug({ ...logContext, code }, 'File not found or inaccessible');
        return jsonError('File not found', 404);
    } finally {
        if (!streaming) {
            fileStream?.destroy();
            await handle?.close();
        }
    }
}
