import path from 'node:path';
import os from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';

const run = promisify(execFile);

/** Only local uploaded files are read; inline previews also work behind authenticated URLs. */
export function uploadedMediaPath(url: string): string {
    const prefix = '/api/uploads/';
    if (!url.startsWith(prefix)) throw new Error('Media is not a local upload');
    const root = path.resolve(process.cwd(), 'public', 'uploads');
    const file = path.resolve(root, decodeURIComponent(url.slice(prefix.length)));
    if (!file.startsWith(root + path.sep)) throw new Error('Invalid media path');
    return file;
}

async function preview(file: string): Promise<string> {
    const buffer = await sharp(file).rotate().resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 }).toBuffer();
    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

export async function taggingImages(media: { url: string; mimeType: string; thumbnailUrl: string | null; duration: number | null }) {
    const input = uploadedMediaPath(media.url);
    if (media.mimeType.startsWith('image/')) return [await preview(input)];
    const temp = await mkdtemp(path.join(os.tmpdir(), 'media-tags-'));
    try {
        let duration = media.duration ?? 0;
        if (!duration) {
            const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', input], { timeout: 15_000 });
            duration = Number(stdout.trim());
        }
        const times = Number.isFinite(duration) && duration > 0 ? [0.05, 0.35, 0.65, 0.9].map(f => duration * f) : [0];
        const images: string[] = [];
        for (const [index, time] of times.entries()) {
            const output = path.join(temp, `${index}.jpg`);
            await run('ffmpeg', ['-y', '-ss', String(time), '-i', input, '-frames:v', '1', '-vf', 'scale=1024:1024:force_original_aspect_ratio=decrease', output], { timeout: 30_000 });
            images.push(await preview(output));
        }
        return images;
    } catch (error) {
        if (media.thumbnailUrl) return [await preview(uploadedMediaPath(media.thumbnailUrl))];
        throw error;
    } finally {
        await rm(temp, { recursive: true, force: true });
    }
}
