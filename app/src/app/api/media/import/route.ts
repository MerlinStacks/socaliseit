import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import YTDlpWrap from 'yt-dlp-wrap';
import { parseJsonBody } from '@/lib/parse-json-body';
import { validateExternalUrl } from '@/lib/validate-url';
import { checkRateLimit, EXPENSIVE_RATE_LIMIT, createRateLimitHeaders } from '@/lib/rate-limit';
import { sanitizeError } from '@/lib/sanitize-error';

export const runtime = 'nodejs';
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
const BIN_DIR = path.join(process.cwd(), 'bin');

export async function POST(request: NextRequest) {
    let outputPath: string | undefined;
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const organizationId = session.user.currentOrganizationId;
        const rateLimitResult = await checkRateLimit(`${session.user.id}:media-import`, EXPENSIVE_RATE_LIMIT);
        if (!rateLimitResult.allowed) {
            return NextResponse.json({ error: 'Rate limit exceeded. Please try again later.' },
                { status: 429, headers: createRateLimitHeaders(rateLimitResult) });
        }
        const { data: body, error } = await parseJsonBody<{ url?: string; folderId?: string }>(request);
        if (error) return error;
        const { url, folderId } = body;
        if (typeof url !== 'string' || !url || (folderId !== undefined && typeof folderId !== 'string')) {
            return NextResponse.json({ error: 'A URL and valid optional folder ID are required' }, { status: 400 });
        }
        // Preflight only: yt-dlp and its children independently resolve/follow URLs.
        // Full SSRF protection requires enforced subprocess egress isolation.
        const urlCheck = await validateExternalUrl(url);
        if (!urlCheck.valid) {
            return NextResponse.json({ error: `Invalid URL: ${urlCheck.reason}` }, { status: 400 });
        }
        if (folderId && !await db.mediaFolder.findFirst({ where: { id: folderId, organizationId }, select: { id: true } })) {
            return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
        }

        await fs.mkdir(UPLOAD_DIR, { recursive: true });
        await fs.mkdir(BIN_DIR, { recursive: true });
        const binaryPath = path.join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
        try {
            await fs.access(binaryPath);
        } catch {
            logger.info('Downloading yt-dlp binary...');
            await YTDlpWrap.downloadFromGithub(binaryPath);
            if (process.platform !== 'win32') await fs.chmod(binaryPath, 0o755);
        }
        const ytDlpWrap = new YTDlpWrap(binaryPath);
        const metadata = await ytDlpWrap.getVideoInfo(url);
        const title = metadata.title || 'Imported Audio';
        const filename = `${randomUUID()}.mp3`;
        outputPath = path.join(UPLOAD_DIR, filename);
        await ytDlpWrap.execPromise([
            url, '-x', '--audio-format', 'mp3', '-o', outputPath, '--no-playlist',
        ]);
        const stats = await fs.stat(outputPath);
        const mediaItem = await db.media.create({
            data: {
                organizationId, folderId: folderId || null, filename: `${title}.mp3`,
                mimeType: 'audio/mpeg', size: stats.size, url: `/api/uploads/${filename}`,
                thumbnailUrl: null, tags: ['imported'],
            },
            include: { folder: { select: { id: true, name: true, color: true } } },
        });
        outputPath = undefined;
        return NextResponse.json({
            id: mediaItem.id, filename: mediaItem.filename, url: mediaItem.url, type: 'audio',
            mimeType: mediaItem.mimeType, size: mediaItem.size, tags: mediaItem.tags,
            folder: mediaItem.folder, createdAt: mediaItem.createdAt.toISOString(),
        }, { status: 201 });
    } catch (error) {
        if (outputPath) await fs.unlink(outputPath).catch(() => undefined);
        logger.error({ error }, 'Import failed');
        return NextResponse.json({ error: sanitizeError(error, 'Import failed') }, { status: 500 });
    }
}
