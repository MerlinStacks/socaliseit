// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import sharp from 'sharp';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/media/resize/route';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    access: vi.fn(), readFile: vi.fn(), writeFile: vi.fn(), unlink: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/db', () => ({ db: { media: {
    findFirst: mocks.findFirst, create: mocks.create, update: mocks.update, delete: mocks.delete,
} } }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock('fs/promises', () => ({ default: {
    access: mocks.access, readFile: mocks.readFile, writeFile: mocks.writeFile, unlink: mocks.unlink,
} }));

const source = {
    id: 'source-media', organizationId: 'org-a', filename: 'portrait.png',
    url: '/api/uploads/portrait.png', mimeType: 'image/png',
    width: 1080, height: 1920, contentHash: 'original-hash',
};
const validBody = {
    sourceMediaId: source.id, targetWidth: 1200, platform: 'google_business', postType: 'feed',
};
const sourcePath = path.join(process.cwd(), 'public', 'uploads', 'portrait.png');

function request(body: unknown = validBody) {
    return new NextRequest('http://localhost/api/media/resize', {
        method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
    });
}

async function solid(width: number, height: number, background = '#ff0000') {
    return sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();
}

// Distinct halves let us verify the actual retained pixels, not just the crop dimensions.
async function portrait() {
    return sharp(await solid(1080, 1920)).composite([
        { input: await solid(1080, 960, '#0000ff'), left: 0, top: 960 },
    ]).png().toBuffer();
}

function writtenBuffer(): Buffer {
    expect(mocks.writeFile).toHaveBeenCalledTimes(1);
    return mocks.writeFile.mock.calls[0][1];
}

async function centerPixel(buffer: Buffer) {
    const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const offset = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
    return Array.from(data.subarray(offset, offset + 3));
}

function expectNoWrites() {
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.unlink).not.toHaveBeenCalled();
}

beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'user-a', currentOrganizationId: 'org-a' } });
    mocks.findFirst.mockResolvedValue({ ...source });
    mocks.access.mockResolvedValue(undefined);
    mocks.writeFile.mockResolvedValue(undefined);
    mocks.create.mockImplementation(async ({ data }) => ({ id: 'resized-media', ...data }));
});

describe('POST /api/media/resize with real Sharp', () => {
    it('turns a 1080x1920 Google portrait into actual 1080x810 landscape without enlargement and preserves the original', async () => {
        const input = await portrait();
        const originalBytes = Buffer.from(input);
        const originalRecord = { ...source };
        mocks.findFirst.mockResolvedValue(originalRecord);
        mocks.readFile.mockResolvedValue(input);

        const response = await POST(request());
        expect(response.status).toBe(200);
        const body = await response.json();
        const output = writtenBuffer();
        expect(await sharp(output).metadata()).toMatchObject({ width: 1080, height: 810, format: 'png' });
        expect(body).toMatchObject({
            skipped: false, originalWidth: 1080, originalHeight: 1920,
            media: { id: 'resized-media', width: 1080, height: 810, size: output.length, mimeType: 'image/png' },
        });
        expect(mocks.findFirst).toHaveBeenCalledExactlyOnceWith({ where: { id: source.id, organizationId: 'org-a' } });
        expect(mocks.access).toHaveBeenCalledWith(sourcePath);
        expect(mocks.readFile).toHaveBeenCalledExactlyOnceWith(sourcePath);
        const destination = mocks.writeFile.mock.calls[0][0];
        expect(destination).not.toBe(sourcePath);
        expect(path.dirname(destination)).toBe(path.dirname(sourcePath));
        expect(path.basename(destination)).toMatch(/^resized-.+\.png$/);
        expect(mocks.create).toHaveBeenCalledExactlyOnceWith({ data: expect.objectContaining({
            organizationId: 'org-a', sourceMediaId: source.id, contentHash: source.contentHash,
            width: 1080, height: 810, size: output.length,
            url: `/api/uploads/${path.basename(destination)}`,
            thumbnailUrl: `/api/uploads/${path.basename(destination)}`,
            tags: ['auto-resized', 'google_business', 'feed'],
        }) });
        expect(input.equals(originalBytes)).toBe(true);
        expect(originalRecord).toEqual(source);
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.delete).not.toHaveBeenCalled();
        expect(mocks.unlink).not.toHaveBeenCalled();
    });

    it.each([
        [0, [255, 0, 0]], [100, [0, 0, 255]],
    ])('honors vertical focal point %s in output pixels', async (y, color) => {
        mocks.readFile.mockResolvedValue(await portrait());
        expect((await POST(request({ ...validBody, focalPoint: { x: 50, y } }))).status).toBe(200);
        expect(await centerPixel(writtenBuffer())).toEqual(color);
    });

    it.each([5, 6, 7, 8])('uses displayed axes for EXIF orientation %s before cropping', async (orientation) => {
        // Stored landscape becomes displayed portrait. A crop in stored axes would fail or retain wrong pixels.
        const displayed = await portrait();
        const input = await sharp(displayed).rotate(90).jpeg({ quality: 100 })
            .withMetadata({ orientation }).toBuffer();
        expect(await sharp(input).metadata()).toMatchObject({ width: 1920, height: 1080, orientation });
        mocks.readFile.mockResolvedValue(input);
        const response = await POST(request({ ...validBody, focalPoint: { x: 50, y: 0 } }));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ originalWidth: 1080, originalHeight: 1920 });
        const output = writtenBuffer();
        const metadata = await sharp(output).metadata();
        expect(metadata).toMatchObject({ width: 1080, height: 810 });
        expect(metadata.orientation).toBeUndefined();
        // Independent auto-oriented reference: sample inside the top retained band.
        const expected = await sharp(input).autoOrient().extract({ left: 500, top: 400, width: 1, height: 1 })
            .removeAlpha().raw().toBuffer();
        const actual = await centerPixel(output);
        actual.forEach((channel, index) => expect(Math.abs(channel - expected[index])).toBeLessThanOrEqual(2));
    });

    it('honors horizontal focal points on a wide image', async () => {
        const input = await sharp(await solid(1920, 1080)).composite([
            { input: await solid(960, 1080, '#0000ff'), left: 960, top: 0 },
        ]).png().toBuffer();
        mocks.readFile.mockResolvedValue(input);
        expect((await POST(request({ ...validBody, focalPoint: { x: 0, y: 50 } }))).status).toBe(200);
        expect(await centerPixel(writtenBuffer())).toEqual([255, 0, 0]);
        mocks.writeFile.mockClear();
        expect((await POST(request({ ...validBody, focalPoint: { x: 100, y: 50 } }))).status).toBe(200);
        expect(await centerPixel(writtenBuffer())).toEqual([0, 0, 255]);
    });

    it.each(['png', 'jpeg', 'webp'] as const)('passes through an already supported %s image without writing', async (format) => {
        mocks.readFile.mockResolvedValue(await sharp(await solid(640, 480)).toFormat(format).toBuffer());
        mocks.findFirst.mockResolvedValue({ ...source, filename: `supported.${format}`, url: `/api/uploads/supported.${format}`, mimeType: `image/${format}` });
        const response = await POST(request());
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ skipped: true });
        expectNoWrites();
    });

    it.each([null, { user: { id: 'user-a' } }, { user: { currentOrganizationId: 'org-a' } }])
        ('rejects incomplete authentication %j before lookup', async (session) => {
            mocks.auth.mockResolvedValue(session);
            expect((await POST(request())).status).toBe(401);
            expect(mocks.findFirst).not.toHaveBeenCalled();
            expect(mocks.readFile).not.toHaveBeenCalled();
            expectNoWrites();
        });

    it('returns 404 when the source is not in the current tenant', async () => {
        mocks.findFirst.mockResolvedValue(null);
        const response = await POST(request({ ...validBody, sourceMediaId: 'other-tenant-media' }));
        expect(response.status).toBe(404);
        expect(mocks.findFirst).toHaveBeenCalledExactlyOnceWith({
            where: { id: 'other-tenant-media', organizationId: 'org-a' },
        });
        expect(mocks.access).not.toHaveBeenCalled();
        expect(mocks.readFile).not.toHaveBeenCalled();
        expectNoWrites();
    });

    it.each([
        null, {}, { ...validBody, sourceMediaId: 123 }, { ...validBody, sourceMediaId: '' },
        { ...validBody, targetWidth: 0 }, { ...validBody, targetWidth: -1 },
        { ...validBody, targetWidth: '720' }, { ...validBody, targetWidth: null },
        { ...validBody, platform: 'unknown' }, { ...validBody, platform: '__proto__' },
        { ...validBody, postType: '' }, { ...validBody, postType: 123 },
        { ...validBody, focalPoint: null }, { ...validBody, focalPoint: { x: -1, y: 50 } },
        { ...validBody, focalPoint: { x: 50, y: 101 } },
        { ...validBody, focalPoint: { x: '50', y: 50 } }, { ...validBody, focalPoint: { x: 50 } },
    ])('rejects invalid input %j before lookup', async (body) => {
        expect((await POST(request(body))).status).toBe(400);
        expect(mocks.findFirst).not.toHaveBeenCalled();
        expect(mocks.readFile).not.toHaveBeenCalled();
        expectNoWrites();
    });

    it('rejects malformed JSON', async () => {
        const response = await POST(new NextRequest('http://localhost/api/media/resize', { method: 'POST', body: '{' }));
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Invalid JSON body' });
        expect(mocks.findFirst).not.toHaveBeenCalled();
        expectNoWrites();
    });

    it('rejects non-image media before reading the file', async () => {
        mocks.findFirst.mockResolvedValue({ ...source, mimeType: 'video/mp4' });
        expect((await POST(request())).status).toBe(400);
        expect(mocks.access).not.toHaveBeenCalled();
        expectNoWrites();
    });

    it('returns 404 for a missing source file', async () => {
        mocks.access.mockRejectedValue(new Error('ENOENT'));
        expect((await POST(request())).status).toBe(404);
        expect(mocks.readFile).not.toHaveBeenCalled();
        expectNoWrites();
    });

    it('returns a controlled failure for corrupt image bytes', async () => {
        mocks.readFile.mockResolvedValue(Buffer.from('not an image'));
        const response = await POST(request());
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Failed to resize image' });
        expectNoWrites();
    });
});
