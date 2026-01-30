import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import YTDlpWrap from 'yt-dlp-wrap';

// Upload directory configuration
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
const BIN_DIR = path.join(process.cwd(), 'bin');

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { url, folderId } = await request.json();

        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        // Ensure directories exist
        if (!fs.existsSync(UPLOAD_DIR)) {
            fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        }
        if (!fs.existsSync(BIN_DIR)) {
            fs.mkdirSync(BIN_DIR, { recursive: true });
        }

        // Setup yt-dlp binary
        const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
        const binaryPath = path.join(BIN_DIR, binaryName);

        // Download binary if not exists
        if (!fs.existsSync(binaryPath)) {
            console.log('Downloading yt-dlp binary...');
            await YTDlpWrap.downloadFromGithub(binaryPath);
            // On Linux/Mac need to chmod +x? downloadFromGithub might handle it or we do it.
            if (process.platform !== 'win32') {
                fs.chmodSync(binaryPath, '755');
            }
        }

        const ytDlpWrap = new YTDlpWrap(binaryPath);

        // Get video metadata first to get title
        console.log('Fetching metadata...');
        const metadata = await ytDlpWrap.getVideoInfo(url);
        const title = metadata.title || 'Imported Audio';

        // Prepare output path
        const uniqueId = randomUUID();
        const filename = `${uniqueId}.mp3`;
        const outputPath = path.join(UPLOAD_DIR, filename);

        console.log(`Downloading audio to ${outputPath}...`);

        // Execute download and conversion
        // -x: Extract audio
        // --audio-format mp3: Convert to mp3
        // -o: Output template (we pass exact path so we don't use template variables if possible, 
        //     but yt-dlp usually appends extension. Let's use template for safety or rely on -o)
        // Actually -o with full path + .%(ext)s is best, but we are forcing mp3.
        // If we force output name to be `filename` (which ends in .mp3), yt-dlp should respect it.

        await ytDlpWrap.execPromise([
            url,
            '-x',
            '--audio-format', 'mp3',
            '-o', outputPath,
            // ensuring no playlist
            '--no-playlist'
        ]);

        // Check file exists (yt-dlp might append .mp3 if we didn't? But we provided .mp3 in outputPath)
        // Sometimes it appends it twice if we are not careful? 
        // -o "path/to/file.mp3" usually works.

        if (!fs.existsSync(outputPath)) {
            throw new Error('File was not created at expected path');
        }

        const stats = fs.statSync(outputPath);

        // Create DB record
        const mediaItem = await db.media.create({
            data: {
                workspaceId: session.user.currentWorkspaceId,
                folderId: folderId || null,
                filename: `${title}.mp3`, // Use original title for display
                mimeType: 'audio/mpeg',
                size: stats.size,
                url: `/uploads/${filename}`,
                thumbnailUrl: null, // No thumbnail for audio
                tags: ['imported'],
            },
            include: { folder: { select: { id: true, name: true, color: true } } },
        });

        return NextResponse.json({
            id: mediaItem.id,
            filename: mediaItem.filename,
            url: mediaItem.url,
            type: 'audio',
            mimeType: mediaItem.mimeType,
            size: mediaItem.size,
            tags: mediaItem.tags,
            folder: mediaItem.folder,
            createdAt: mediaItem.createdAt.toISOString(),
        }, { status: 201 });

    } catch (error) {
        console.error('Import failed:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Detailed import error' },
            { status: 500 }
        );
    }
}
