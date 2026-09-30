// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { receiveUpload } from '../receive-upload';
import { MAX_VIDEO_UPLOAD_SIZE } from '../upload-limits';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { config } from '@/proxy';

let directory: string;
beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), 'media-upload-')); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

function request(size: number, type = 'video/mp4', ending = true, signal?: AbortSignal) {
    const body = Readable.toWeb(Readable.from((async function* () {
        yield Buffer.from(`--boundary\r\nContent-Disposition: form-data; name="file"; filename="video.mp4"\r\nContent-Type: ${type}\r\n\r\n`);
        const chunk = Buffer.alloc(64 * 1024, 7);
        for (let sent = 0; sent < size; sent += chunk.length) {
            yield chunk.subarray(0, Math.min(chunk.length, size - sent));
        }
        if (ending) yield Buffer.from('\r\n--boundary\r\nContent-Disposition: form-data; name="folderId"\r\n\r\nfolder-1\r\n--boundary\r\nContent-Disposition: form-data; name="tags"\r\n\r\nyoutube,long-form\r\n--boundary--\r\n');
    })()));
    return new Request('http://localhost/api/media', {
        method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=boundary' },
        body: body as ReadableStream<Uint8Array>, duplex: 'half', signal,
    } as RequestInit);
}

describe('streaming media upload', () => {
    it('accepts a 278 MiB video and metadata fields sent after the file', async () => {
        const size = 278 * 1024 * 1024;
        const result = await receiveUpload(request(size), directory);
        expect(result.file.size).toBe(size);
        expect((await stat(result.file.filePath)).size).toBe(size);
        expect(result.folderId).toBe('folder-1');
        expect(result.tagsRaw).toBe('youtube,long-form');
    }, 30_000);

    it('keeps the 100 MiB image limit and removes oversized partial files', async () => {
        await expect(receiveUpload(request(101 * 1024 * 1024, 'image/jpeg'), directory))
            .rejects.toMatchObject({ status: 413, message: expect.stringContaining('100 MB') });
        expect(await readdir(directory)).toEqual([]);
    }, 15_000);

    it('accepts the exact video limit and rejects one byte beyond it without a Content-Length', async () => {
        const result = await receiveUpload(request(MAX_VIDEO_UPLOAD_SIZE), directory);
        expect((await stat(result.file.filePath)).size).toBe(MAX_VIDEO_UPLOAD_SIZE);
        await rm(result.file.filePath);
        await expect(receiveUpload(request(MAX_VIDEO_UPLOAD_SIZE + 1), directory))
            .rejects.toMatchObject({ status: 413 });
        expect(await readdir(directory)).toEqual([]);
    }, 30_000);

    it('rejects a declared body over the video limit before reading', async () => {
        const upload = request(1);
        upload.headers.set('content-length', String(MAX_VIDEO_UPLOAD_SIZE + 65537));
        await expect(receiveUpload(upload, directory)).rejects.toMatchObject({ status: 413 });
        expect(upload.bodyUsed).toBe(false);
    });

    it('cleans up truncated multipart uploads', async () => {
        await expect(receiveUpload(request(1024, 'video/mp4', false), directory)).rejects.toThrow();
        expect(await readdir(directory)).toEqual([]);
    });

    it('rejects unsupported file types without retaining files', async () => {
        await expect(receiveUpload(request(1024, 'text/plain'), directory)).rejects.toMatchObject({ status: 400 });
        expect(await readdir(directory)).toEqual([]);
    });

    it('cleans up aborted uploads', async () => {
        const controller = new AbortController();
        const pending = receiveUpload(request(1024 * 1024, 'video/mp4', true, controller.signal), directory);
        controller.abort();
        await expect(pending).rejects.toThrow();
        expect(await readdir(directory)).toEqual([]);
    });

    it('bypasses proxy buffering only for the media upload endpoint', () => {
        for (const url of ['/api/media', '/api/media/', '/api/media?folderId=1']) {
            expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
        }
        for (const url of ['/api/media/folders', '/api/media/resize', '/api/posts', '/media']) {
            expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
        }
    });
});
