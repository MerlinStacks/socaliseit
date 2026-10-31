import { NextResponse } from 'next/server';
import { rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { sanitizeError } from '@/lib/sanitize-error';
import { videoTranscodeQueue } from '@/lib/bullmq/queues';
import { getVideoMetadata, needsTranscoding, isFFmpegAvailable } from '@/lib/services/video-transcode';
import { receiveUpload, UploadError } from './receive-upload';
import { generateVideoThumbnail } from './thumbnail-generator';
import { computeImageHash } from './image-hash';
import { autoTagUpload } from './tag-queue';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

/** Shared multipart storage/processing pipeline. Callers must authenticate and rate-limit first. */
export async function uploadMedia(request: Request, organizationId: string, validateFile?: (name: string, mimeType: string) => void) {
    let pendingFilePath: string | undefined;
    try {
        const { file, folderId, tagsRaw } = await receiveUpload(request, UPLOAD_DIR, validateFile);
        const { filePath, uniqueName } = file;
        const mimeType = file.type;
        pendingFilePath = filePath;
        if (folderId) {
            const folder = await db.mediaFolder.findFirst({ where: { id: folderId, organizationId } });
            if (!folder) {
                await unlink(filePath);
                pendingFilePath = undefined;
                return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
            }
        }

        let imageWidth: number | null = null;
        let imageHeight: number | null = null;
        let optimizedFilePath = filePath;
        let optimizedUniqueName = uniqueName;
        let optimizedMimeType = mimeType;
        let optimizedSize = file.size;
        if (mimeType.startsWith('image/') && mimeType !== 'image/gif') {
            let stagingPath: string | undefined;
            try {
                const isHeic = mimeType === 'image/heic' || mimeType === 'image/heif';
                const isJpeg = isHeic || mimeType === 'image/jpeg' || mimeType === 'image/webp';
                let pipeline = sharp(filePath).rotate().toColorspace('srgb');
                pipeline = isJpeg ? pipeline.toFormat('jpeg', { quality: 95, progressive: true }) : pipeline.toFormat('png');
                const optimized = await pipeline.toBuffer({ resolveWithObject: true });
                const converted = isHeic || mimeType === 'image/webp';
                const outputName = converted ? uniqueName.replace(/\.[^.]+$/, '.jpg') : uniqueName;
                const outputPath = path.join(path.dirname(filePath), outputName);
                // Never truncate the original or publish new metadata before the replacement is complete.
                stagingPath = `${filePath}.optimized`;
                await writeFile(stagingPath, optimized.data);
                await rename(stagingPath, outputPath);
                stagingPath = undefined;
                pendingFilePath = outputPath;
                optimizedUniqueName = outputName;
                optimizedFilePath = outputPath;
                optimizedMimeType = converted ? 'image/jpeg' : mimeType;
                optimizedSize = optimized.data.length;
                imageWidth = optimized.info.width;
                imageHeight = optimized.info.height;
                if (optimizedFilePath !== filePath) await unlink(filePath).catch(() => {});
            } catch (error) {
                logger.warn({ error, filePath }, 'Image optimization failed, using original');
                try {
                    const meta = await sharp(filePath).metadata();
                    imageWidth = meta.width ?? null;
                    imageHeight = meta.height ?? null;
                } catch { /* dimensions unavailable */ }
            } finally {
                if (stagingPath) await unlink(stagingPath).catch(() => {});
            }
        } else if (mimeType === 'image/gif') {
            try {
                const meta = await sharp(filePath).metadata();
                imageWidth = meta.width ?? null;
                imageHeight = meta.height ?? null;
            } catch { /* preserve GIF animation */ }
        }

        const tags = tagsRaw ? tagsRaw.split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean) : [];
        let thumbnailUrl: string | null = null;
        if (optimizedMimeType.startsWith('image/')) thumbnailUrl = `/api/uploads/${optimizedUniqueName}`;
        else if (optimizedMimeType.startsWith('video/')) {
            thumbnailUrl = await generateVideoThumbnail(optimizedFilePath, optimizedUniqueName.replace(path.extname(optimizedUniqueName), ''));
        }

        let transcodeStatus: string | null = null;
        let videoMetadata: { codec: string; width: number; height: number; duration: number } | null = null;
        const forceTranscode = optimizedMimeType === 'video/quicktime' || path.extname(optimizedUniqueName).toLowerCase() === '.mov';
        if (optimizedMimeType.startsWith('video/') && await isFFmpegAvailable()) {
            try {
                const metadata = await getVideoMetadata(optimizedFilePath);
                if (metadata && (forceTranscode || needsTranscoding(metadata, 'UPLOAD_GENERIC'))) {
                    transcodeStatus = 'pending';
                    videoMetadata = metadata;
                }
            } catch (error) { logger.warn({ error }, '[Media Upload] Video stored without transcoding'); }
        }

        const contentHash = optimizedMimeType.startsWith('image/') ? await computeImageHash(optimizedFilePath) : null;
        const mediaItem = await db.media.create({
            data: { organizationId, folderId: folderId || null, filename: file.name, mimeType: optimizedMimeType,
                size: optimizedSize, width: imageWidth, height: imageHeight, url: `/api/uploads/${optimizedUniqueName}`,
                thumbnailUrl, transcodeStatus, tags, contentHash },
            include: { folder: { select: { id: true, name: true, color: true } } },
        });
        pendingFilePath = undefined;

        if (transcodeStatus === 'pending' && videoMetadata) {
            try {
                await videoTranscodeQueue.add('transcode', {
                    mediaId: mediaItem.id, inputPath: optimizedFilePath, outputDir: path.join(UPLOAD_DIR, 'transcoded'),
                    preset: 'UPLOAD_GENERIC', organizationId, duration: videoMetadata.duration, forceTranscode,
                }, { jobId: `transcode-${mediaItem.id}` });
            } catch (error) {
                logger.warn({ error }, '[Media Upload] Failed to enqueue transcode job, video stored as-is');
                await db.media.update({ where: { id: mediaItem.id }, data: { transcodeStatus: null } });
                transcodeStatus = null;
            }
        }
        await autoTagUpload(organizationId, mediaItem.id, mediaItem.mimeType);
        return NextResponse.json({
            id: mediaItem.id, filename: mediaItem.filename, url: mediaItem.url, transcodedUrl: mediaItem.transcodedUrl,
            thumbnailUrl: mediaItem.thumbnailUrl,
            type: mediaItem.mimeType.startsWith('video/') ? 'video' : mediaItem.mimeType.startsWith('audio/') ? 'audio' : 'image',
            mimeType: mediaItem.mimeType, size: mediaItem.size,
            dimensions: mediaItem.width && mediaItem.height ? { width: mediaItem.width, height: mediaItem.height } : null,
            tags: mediaItem.tags, folder: mediaItem.folder, transcodeStatus, createdAt: mediaItem.createdAt.toISOString(),
        }, { status: 201 });
    } catch (error) {
        if (pendingFilePath) await unlink(pendingFilePath).catch(() => {});
        if (error instanceof UploadError) return NextResponse.json({ error: error.message }, { status: error.status });
        logger.error({ error }, 'Failed to upload media');
        return NextResponse.json({ error: sanitizeError(error, 'Failed to upload media') }, { status: 500 });
    }
}
