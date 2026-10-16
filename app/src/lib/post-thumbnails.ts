import { mkdir, writeFile, readFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import path from 'path';
import sharp from 'sharp';
import { db } from '@/lib/db';
import { resolveLocalFilePath } from '@/lib/platform-api/local-file';

/** The frame picker returns data URLs; publish APIs need durable, publicly served images. */
export async function resolvePostThumbnails(organizationId: string, thumbnails?: Record<string, string>): Promise<Record<string, string> | undefined> {
    if (thumbnails === undefined) return undefined;
    const result: Record<string, string> = {};
    for (const [mediaId, value] of Object.entries(thumbnails)) {
        if (typeof value !== 'string') throw new Error('Invalid custom thumbnail');
        if (!value) { result[mediaId] = ''; continue; }
        const prefix = `/api/uploads/thumbnails/${organizationId}/`;
        if (value.startsWith(prefix) && /^[a-f0-9-]+\.jpg$/.test(value.slice(prefix.length))) {
            result[mediaId] = value;
            continue;
        }
        let input: Buffer;
        if (value.startsWith('/api/uploads/')) {
            const owned = await db.media.findFirst({ where: { organizationId, url: value, mimeType: { startsWith: 'image/' } }, select: { id: true } });
            if (!owned) throw new Error('Custom thumbnail image not found in this organization');
            input = await readFile(resolveLocalFilePath(value));
        } else {
            const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);
            if (!match || value.length > 3_000_000) throw new Error('Custom thumbnail must be an uploaded image or an image frame under 2MB');
            input = Buffer.from(match[1], 'base64');
        }
        const buffer = await sharp(input, { limitInputPixels: 25_000_000 })
            .rotate().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
        const directory = path.join(process.cwd(), 'public', 'uploads', 'thumbnails', organizationId);
        await mkdir(directory, { recursive: true });
        const filename = `${randomUUID()}.jpg`;
        await writeFile(path.join(directory, filename), buffer);
        result[mediaId] = `${prefix}${filename}`;
    }
    return result;
}
