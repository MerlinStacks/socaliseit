import busboy from 'busboy';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { writeUpload } from './write-upload';
import { getUploadSizeLimit, MAX_VIDEO_UPLOAD_SIZE, uploadSizeError } from './upload-limits';

const MIME_TYPES: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic', '.heif': 'image/heif',
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav', '.aac': 'audio/aac', '.m4a': 'audio/x-m4a',
};
const ALLOWED_TYPES = new Set([...Object.values(MIME_TYPES), 'audio/mp4']);

export class UploadError extends Error {
    constructor(message: string, public readonly status = 400) { super(message); }
}

/** Parse multipart data with backpressure, never materializing a File in memory. */
export async function receiveUpload(request: Request, directory: string) {
    if (!request.body) throw new UploadError('No file provided');
    const length = Number(request.headers.get('content-length'));
    if (length > MAX_VIDEO_UPLOAD_SIZE + 64 * 1024) {
        throw new UploadError(uploadSizeError('video/mp4'), 413);
    }
    let parser: ReturnType<typeof busboy>;
    try {
        parser = busboy({
            headers: { 'content-type': request.headers.get('content-type') || '' },
            // Busboy emits partsLimit when the count reaches the limit (not exceeds it).
            limits: { files: 1, fields: 2, parts: 4, fieldSize: 16 * 1024, fileSize: MAX_VIDEO_UPLOAD_SIZE + 1 },
        });
    } catch { throw new UploadError('Invalid multipart upload'); }

    await mkdir(directory, { recursive: true });
    const fields: Record<string, string> = {};
    let file: { name: string; type: string; size: number; uniqueName: string; filePath: string } | undefined;
    let failure: Error | undefined;
    let writing: Promise<void> = Promise.resolve();
    const reject = (error: Error) => { failure ??= error; };

    parser.on('field', (name, value, info) => {
        if (info.valueTruncated || !['folderId', 'tags'].includes(name) || name in fields) {
            reject(new UploadError('Invalid upload fields'));
        } else fields[name] = value;
    });
    parser.on('filesLimit', () => reject(new UploadError('Only one file allowed')));
    parser.on('fieldsLimit', () => reject(new UploadError('Too many upload fields')));
    parser.on('partsLimit', () => reject(new UploadError('Too many upload parts')));
    parser.on('file', (name, stream, info) => {
        const extension = path.extname(info.filename).toLowerCase();
        const mimeType = info.mimeType === 'application/octet-stream'
            ? MIME_TYPES[extension] || '' : info.mimeType;
        if (name !== 'file' || !ALLOWED_TYPES.has(mimeType)) {
            reject(new UploadError('Invalid file type. Upload an image, MP4/MOV video, or audio file.'));
            stream.resume();
            return;
        }
        const uniqueName = `${randomUUID()}${extension}`;
        const uploaded = { name: info.filename, type: mimeType, size: 0, uniqueName, filePath: path.join(directory, uniqueName) };
        file = uploaded;
        stream.on('limit', () => reject(new UploadError(uploadSizeError(mimeType), 413)));
        const counted = Readable.from((async function* () {
            for await (const chunk of stream) {
                uploaded.size += chunk.length;
                if (uploaded.size > getUploadSizeLimit(mimeType)) {
                    throw new UploadError(uploadSizeError(mimeType), 413);
                }
                yield chunk;
            }
        })());
        writing = writeUpload(Readable.toWeb(counted) as ReadableStream<Uint8Array>, uploaded.filePath, request.signal)
            .catch(error => { reject(error); parser.destroy(error); });
    });

    // Enforce the total even for chunked requests and discarded multipart parts.
    let received = 0;
    const bounded = new Transform({
        transform(chunk, _encoding, callback) {
            received += chunk.length;
            callback(received > MAX_VIDEO_UPLOAD_SIZE + 64 * 1024
                ? new UploadError(uploadSizeError('video/mp4'), 413) : null, chunk);
        },
    });
    try {
        await pipeline(Readable.fromWeb(request.body as NodeReadableStream<Uint8Array>), bounded, parser, { signal: request.signal });
    } catch (error) {
        reject(error instanceof UploadError ? error : new UploadError('Upload interrupted or malformed. Please try again.'));
    }
    await writing;
    if (failure || !file) {
        if (file) await unlink(file.filePath).catch(() => {});
        throw failure || new UploadError('No file provided');
    }
    return { file, folderId: fields.folderId || null, tagsRaw: fields.tags || null };
}
