// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ receive: vi.fn(), create: vi.fn(), update: vi.fn(), folder: vi.fn(),
    thumbnail: vi.fn(), available: vi.fn(), metadata: vi.fn(), needs: vi.fn(), enqueue: vi.fn(), hash: vi.fn(), tag: vi.fn(), auth: vi.fn(), rate: vi.fn() }));
vi.mock('node:fs/promises', async importOriginal => {
    const actual = await importOriginal<typeof import('node:fs/promises')>();
    return { ...actual, writeFile: vi.fn(actual.writeFile), rename: vi.fn(actual.rename) };
});
vi.mock('@/lib/db', () => ({ db: { media: { create: mocks.create, update: mocks.update }, mediaFolder: { findFirst: mocks.folder } } }));
vi.mock('@/lib/media/receive-upload', async importOriginal => ({ ...await importOriginal<typeof import('../receive-upload')>(), receiveUpload: mocks.receive }));
vi.mock('@/lib/media/thumbnail-generator', () => ({ generateVideoThumbnail: mocks.thumbnail }));
vi.mock('@/lib/media/image-hash', () => ({ computeImageHash: mocks.hash }));
vi.mock('@/lib/media/tag-queue', () => ({ autoTagUpload: mocks.tag }));
vi.mock('@/lib/services/video-transcode', () => ({ isFFmpegAvailable: mocks.available, getVideoMetadata: mocks.metadata, needsTranscoding: mocks.needs }));
vi.mock('@/lib/bullmq/queues', () => ({ videoTranscodeQueue: { add: mocks.enqueue } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.rate, createRateLimitHeaders: vi.fn() }));

import { uploadMedia } from '../upload-service';
import { UploadError } from '../receive-upload';
import { POST as browserUpload } from '@/app/api/media/route';

let directory: string;
let filePath: string;
beforeEach(async () => {
    vi.resetAllMocks();
    const filesystem = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.mocked(writeFile).mockImplementation(filesystem.writeFile);
    vi.mocked(rename).mockImplementation(filesystem.rename);
    directory = await mkdtemp(path.join(tmpdir(), 'shared-media-upload-'));
    filePath = path.join(directory, 'image.png');
    const image = await sharp({ create: { width: 3, height: 2, channels: 3, background: '#ddaa77' } }).png().toBuffer();
    await writeFile(filePath, image);
    mocks.receive.mockResolvedValue({ file: { name: 'original.png', type: 'image/png', size: image.length,
        uniqueName: 'image.png', filePath }, folderId: null, tagsRaw: 'Launch, Product' });
    mocks.create.mockImplementation(async ({ data }) => ({ id: 'media1', ...data, transcodedUrl: null, folder: null, createdAt: new Date() }));
    mocks.hash.mockResolvedValue('image-hash');
    mocks.available.mockResolvedValue(true);
    mocks.needs.mockReturnValue(true);
    mocks.metadata.mockResolvedValue({ codec: 'hevc', width: 1920, height: 1080, duration: 20 });
    mocks.thumbnail.mockResolvedValue('/api/uploads/thumb.jpg');
    mocks.auth.mockResolvedValue({ user: { id: 'user1', currentOrganizationId: 'org1' } });
    mocks.rate.mockResolvedValue({ allowed: true });
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

describe('shared browser/MCP media storage', () => {
    it('optimizes real image bytes and keeps dimensions, tags, hashing, and auto-tagging', async () => {
        const request = new Request('http://localhost/upload');
        const response = await uploadMedia(request, 'org1');
        expect(response.status).toBe(201);
        expect(await response.json()).toMatchObject({ id: 'media1', filename: 'original.png', dimensions: { width: 3, height: 2 }, tags: ['launch', 'product'] });
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
            organizationId: 'org1', mimeType: 'image/png', width: 3, height: 2, contentHash: 'image-hash', url: '/api/uploads/image.png',
        }) }));
        expect((await sharp(await readFile(filePath)).metadata()).width).toBe(3);
        expect(mocks.tag).toHaveBeenCalledWith('org1', 'media1', 'image/png');
    });
    it('passes optional strict filename validation down to the streaming receiver', async () => {
        const validate = vi.fn();
        const request = new Request('http://localhost/upload');
        await uploadMedia(request, 'org1', validate);
        expect(mocks.receive).toHaveBeenCalledWith(request, expect.any(String), validate);
    });
    it('keeps MIME type and storage extension consistent when converting WebP to JPEG', async () => {
        const webpPath = path.join(directory, 'image.webp');
        const webp = await sharp(filePath).webp().toBuffer();
        await writeFile(webpPath, webp);
        mocks.receive.mockResolvedValueOnce({ file: { name: 'original.webp', type: 'image/webp', size: webp.length,
            uniqueName: 'image.webp', filePath: webpPath }, folderId: null, tagsRaw: null });
        const response = await uploadMedia(new Request('http://localhost'), 'org1');
        expect(await response.json()).toMatchObject({ mimeType: 'image/jpeg', url: '/api/uploads/image.jpg' });
        expect((await sharp(path.join(directory, 'image.jpg')).metadata()).format).toBe('jpeg');
        await expect(stat(webpPath)).rejects.toMatchObject({ code: 'ENOENT' });
    });
    it.each(['write', 'rename'])('preserves the original WebP and removes staging output after a failed %s', async failure => {
        const webpPath = path.join(directory, 'image.webp');
        const webp = await sharp(filePath).webp().toBuffer();
        await writeFile(webpPath, webp);
        mocks.receive.mockResolvedValueOnce({ file: { name: 'original.webp', type: 'image/webp', size: webp.length,
            uniqueName: 'image.webp', filePath: webpPath }, folderId: null, tagsRaw: null });
        if (failure === 'write') {
            const filesystem = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
            vi.mocked(writeFile).mockImplementationOnce(async destination => {
                await filesystem.writeFile(destination, 'partial image');
                throw new Error('Disk full');
            });
        } else vi.mocked(rename).mockRejectedValueOnce(new Error('Rename failed'));

        const response = await uploadMedia(new Request('http://localhost'), 'org1');
        expect(response.status).toBe(201);
        expect(await response.json()).toMatchObject({ mimeType: 'image/webp', size: webp.length,
            url: '/api/uploads/image.webp', thumbnailUrl: '/api/uploads/image.webp' });
        expect(await readFile(webpPath)).toEqual(webp);
        expect((await readdir(directory)).sort()).toEqual(['image.png', 'image.webp']);
        expect(mocks.hash).toHaveBeenCalledWith(webpPath);
    });
    it('does not truncate same-format originals when an optimized write fails', async () => {
        const original = await readFile(filePath);
        const filesystem = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
        vi.mocked(writeFile).mockImplementationOnce(async destination => {
            await filesystem.writeFile(destination, 'partial PNG');
            throw new Error('Disk full');
        });
        const response = await uploadMedia(new Request('http://localhost'), 'org1');
        expect(response.status).toBe(201);
        expect(await readFile(filePath)).toEqual(original);
        expect(await readdir(directory)).toEqual(['image.png']);
    });
    it('removes converted output after database failure', async () => {
        const webpPath = path.join(directory, 'image.webp');
        const webp = await sharp(filePath).webp().toBuffer();
        await writeFile(webpPath, webp);
        mocks.receive.mockResolvedValueOnce({ file: { name: 'original.webp', type: 'image/webp', size: webp.length,
            uniqueName: 'image.webp', filePath: webpPath }, folderId: null, tagsRaw: null });
        mocks.create.mockRejectedValueOnce(new Error('Database unavailable'));
        expect((await uploadMedia(new Request('http://localhost'), 'org1')).status).toBe(500);
        expect(await readdir(directory)).toEqual(['image.png']);
    });
    it('checks folder ownership and removes the file when the folder is foreign', async () => {
        mocks.receive.mockResolvedValueOnce({ file: { name: 'file.png', type: 'image/png', size: 1, uniqueName: 'image.png', filePath }, folderId: 'foreign', tagsRaw: null });
        mocks.folder.mockResolvedValueOnce(null);
        expect((await uploadMedia(new Request('http://localhost'), 'org1')).status).toBe(404);
        expect(mocks.folder).toHaveBeenCalledWith({ where: { id: 'foreign', organizationId: 'org1' } });
        expect(mocks.create).not.toHaveBeenCalled();
        await expect(stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    });
    it('removes uncommitted files on database failure', async () => {
        mocks.create.mockRejectedValueOnce(new Error('Database unavailable'));
        expect((await uploadMedia(new Request('http://localhost'), 'org1')).status).toBe(500);
        await expect(stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    });
    it('keeps video thumbnail generation and asynchronous transcoding in the existing queue', async () => {
        mocks.receive.mockResolvedValueOnce({ file: { name: 'clip.mov', type: 'video/quicktime', size: 123,
            uniqueName: 'clip.mov', filePath }, folderId: null, tagsRaw: null });
        const response = await uploadMedia(new Request('http://localhost'), 'org1');
        expect(await response.json()).toMatchObject({ id: 'media1', transcodeStatus: 'pending', type: 'video' });
        expect(mocks.thumbnail).toHaveBeenCalledWith(filePath, 'clip');
        expect(mocks.enqueue).toHaveBeenCalledWith('transcode', expect.objectContaining({
            organizationId: 'org1', mediaId: 'media1', inputPath: filePath, forceTranscode: true, preset: 'UPLOAD_GENERIC',
        }), { jobId: 'transcode-media1' });
    });
    it('reports the persisted fallback state when the transcode queue is unavailable', async () => {
        mocks.receive.mockResolvedValueOnce({ file: { name: 'clip.mov', type: 'video/quicktime', size: 123,
            uniqueName: 'clip.mov', filePath }, folderId: null, tagsRaw: null });
        mocks.enqueue.mockRejectedValueOnce(new Error('Queue unavailable'));
        expect(await (await uploadMedia(new Request('http://localhost'), 'org1')).json()).toMatchObject({ transcodeStatus: null });
        expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'media1' }, data: { transcodeStatus: null } });
    });
    it('preserves multipart validation status codes', async () => {
        mocks.receive.mockRejectedValueOnce(new UploadError('File too large', 413));
        expect((await uploadMedia(new Request('http://localhost'), 'org1')).status).toBe(413);
        expect(mocks.create).not.toHaveBeenCalled();
    });
    it('still authenticates browser uploads and uses the same shared storage function', async () => {
        const response = await browserUpload(new NextRequest('http://localhost/api/media', { method: 'POST' }));
        expect(response.status).toBe(201);
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: 'org1' }) }));
        mocks.receive.mockClear();
        mocks.auth.mockResolvedValueOnce(null);
        expect((await browserUpload(new NextRequest('http://localhost/api/media', { method: 'POST' }))).status).toBe(401);
        expect(mocks.receive).not.toHaveBeenCalled();
    });
});
