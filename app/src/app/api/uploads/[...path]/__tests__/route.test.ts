// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile, type FileHandle } from 'node:fs/promises';
import type { ReadStream } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    open: vi.fn(), error: vi.fn(), debug: vi.fn(), failResponse: false,
    converted: Buffer.from('converted-image'),
}));
vi.mock('fs/promises', async importOriginal => ({
    ...await importOriginal<typeof import('node:fs/promises')>(), open: mocks.open,
}));
vi.mock('@/lib/logger', () => ({ logger: { error: mocks.error, debug: mocks.debug } }));
vi.mock('sharp', () => ({ default: () => {
    const pipeline = {
        rotate: () => pipeline, toColorspace: () => pipeline,
        toFormat: () => pipeline, toBuffer: async () => mocks.converted,
    };
    return pipeline;
} }));
vi.mock('next/server', () => ({ NextResponse: class extends Response {
    constructor(body?: BodyInit | null, init?: ResponseInit) {
        if (mocks.failResponse) {
            mocks.failResponse = false;
            throw new Error('Response construction failed');
        }
        super(body, init);
    }
    static json(body: unknown, init?: ResponseInit) { return Response.json(body, init); }
} }));

import { GET, HEAD } from '../route';

describe('upload response lifecycle (real Node file streams)', () => {
    let directory: string;
    let handle: FileHandle;
    let stream: ReadStream | undefined;
    let createStream: ReturnType<typeof vi.spyOn>;
    const context = { params: Promise.resolve({ path: ['private-name.mp4'] }) };
    function request(method = 'GET', range?: string, signal?: AbortSignal, query = '') {
        const url = new URL(`http://localhost/api/uploads/private-name.mp4${query}`);
        return Object.assign(new Request(url, {
            method, signal, headers: range ? { range } : {},
        }), { nextUrl: url }) as NextRequest;
    }
    async function closed() {
        await vi.waitFor(() => expect(handle.fd).toBe(-1));
    }

    beforeEach(async () => {
        vi.clearAllMocks();
        stream = undefined;
        mocks.failResponse = false;
        directory = await mkdtemp(join(tmpdir(), 'upload-route-'));
        const file = join(directory, 'fixture.mp4');
        await writeFile(file, Buffer.alloc(4 * 1024 * 1024, 'x'));
        const fs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
        handle = await fs.open(file, 'r');
        const original = handle.createReadStream.bind(handle);
        createStream = vi.spyOn(handle, 'createReadStream').mockImplementation(options => {
            stream = original(options);
            return stream;
        });
        mocks.open.mockReset().mockResolvedValue(handle);
    });
    afterEach(async () => {
        stream?.destroy();
        await handle.close();
        await rm(directory, { recursive: true, force: true });
    });

    it.each([HEAD, GET])('HEAD closes the descriptor without creating a stream (%#)', async handler => {
        const response = await handler(request('HEAD'), context);
        expect(response.status).toBe(200);
        expect(response.body).toBeNull();
        expect(response.headers.get('content-length')).toBe(String(4 * 1024 * 1024));
        expect(createStream).not.toHaveBeenCalled();
        await closed();
    });
    it('GET streams the complete file and closes at EOF', async () => {
        const response = await GET(request(), context);
        expect(response.status).toBe(200);
        expect((await response.arrayBuffer()).byteLength).toBe(4 * 1024 * 1024);
        await closed();
    });
    it('empty GET completes with zero length and closes the descriptor', async () => {
        await writeFile(join(directory, 'fixture.mp4'), Buffer.alloc(0));
        const response = await GET(request(), context);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-length')).toBe('0');
        expect(await response.text()).toBe('');
        await closed();
    });
    it.each(['bytes=2-5', 'bytes=-4'])('serves a real range: %s', async range => {
        const response = await GET(request('GET', range), context);
        expect(response.status).toBe(206);
        expect(response.headers.get('content-length')).toBe('4');
        expect(response.headers.get('content-range')).toBe(range === 'bytes=2-5'
            ? 'bytes 2-5/4194304' : 'bytes 4194300-4194303/4194304');
        expect(await response.text()).toBe('xxxx');
        await closed();
    });
    it('HEAD preserves range metadata', async () => {
        const response = await HEAD(request('HEAD', 'bytes=2-5'), context);
        expect(response.status).toBe(206);
        expect(response.headers.get('content-length')).toBe('4');
        expect(response.body).toBeNull();
        expect(createStream).not.toHaveBeenCalled();
        await closed();
    });
    it('invalid range closes without a stream', async () => {
        const response = await GET(request('GET', 'bytes=99999999-'), context);
        expect(response.status).toBe(416);
        expect(response.headers.get('content-range')).toBe('bytes */4194304');
        expect(createStream).not.toHaveBeenCalled();
        await closed();
    });
    it.each(['GET', 'HEAD'])('conversion keeps full converted length for %s and ignores range', async method => {
        const response = await (method === 'HEAD' ? HEAD : GET)(request(method, 'bytes=2-5', undefined, '?format=jpeg'), context);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-length')).toBe(String(mocks.converted.length));
        expect(response.headers.get('content-type')).toBe('image/jpeg');
        if (method === 'HEAD') expect(response.body).toBeNull();
        else expect(await response.text()).toBe(mocks.converted.toString());
        expect(createStream).not.toHaveBeenCalled();
        await closed();
    });
    it('pre-abort never opens a file', async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(GET(request('GET', undefined, controller.signal), context)).rejects.toMatchObject({ name: 'AbortError' });
        expect(mocks.open).not.toHaveBeenCalled();
    });
    it('abort while opening closes the newly acquired handle', async () => {
        const controller = new AbortController();
        mocks.open.mockImplementation(async () => { controller.abort(); return handle; });
        await expect(GET(request('GET', undefined, controller.signal), context)).rejects.toMatchObject({ name: 'AbortError' });
        expect(createStream).not.toHaveBeenCalled();
        await closed();
    });
    it('mid-stream abort errors the body and closes the descriptor', async () => {
        const controller = new AbortController();
        const response = await GET(request('GET', undefined, controller.signal), context);
        const reader = response.body!.getReader();
        await reader.read();
        controller.abort();
        await expect((async () => { while (!(await reader.read()).done) { /* drain queued data */ } })()).rejects.toMatchObject({ name: 'AbortError' });
        await closed();
        expect(mocks.error).not.toHaveBeenCalled();
    });
    it('body.cancel destroys the stream and closes the descriptor', async () => {
        const response = await GET(request(), context);
        await response.body!.cancel();
        await closed();
        expect(stream!.destroyed).toBe(true);
        expect(mocks.error).not.toHaveBeenCalled();
    });
    it('missing file returns 404', async () => {
        mocks.open.mockRejectedValue(Object.assign(new Error('private path'), { code: 'ENOENT' }));
        expect((await GET(request(), context)).status).toBe(404);
        expect(createStream).not.toHaveBeenCalled();
        expect(JSON.stringify(mocks.debug.mock.calls)).not.toContain('private');
    });
    it('stat failure closes the descriptor', async () => {
        vi.spyOn(handle, 'stat').mockRejectedValue(new Error('stat failed'));
        expect((await GET(request(), context)).status).toBe(404);
        await closed();
    });
    it('conversion read failure closes the descriptor without creating a stream', async () => {
        vi.spyOn(handle, 'readFile').mockRejectedValue(new Error('read failed'));
        expect((await HEAD(request('HEAD', undefined, undefined, '?format=png'), context)).status).toBe(404);
        expect(createStream).not.toHaveBeenCalled();
        await closed();
    });
    it('abort during stat closes before stream creation', async () => {
        const controller = new AbortController();
        const stats = await handle.stat();
        vi.spyOn(handle, 'stat').mockImplementation(async () => { controller.abort(); return stats; });
        await expect(GET(request('GET', undefined, controller.signal), context)).rejects.toMatchObject({ name: 'AbortError' });
        expect(createStream).not.toHaveBeenCalled();
        await closed();
    });
    it('response construction failure destroys the stream and closes the descriptor', async () => {
        mocks.failResponse = true;
        expect((await GET(request(), context)).status).toBe(404);
        expect(stream!.destroyed).toBe(true);
        await closed();
    });
    it('non-abort stream errors reach the reader and are logged with sanitized context', async () => {
        const response = await GET(request(), context);
        stream!.destroy(Object.assign(new Error('/private/files/secret.mp4'), { code: 'EIO' }));
        await expect(response.arrayBuffer()).rejects.toMatchObject({ code: 'EIO' });
        await closed();
        expect(mocks.error).toHaveBeenCalledWith({
            route: '/api/uploads/[...path]', method: 'GET', extension: '.mp4', code: 'EIO',
        }, 'Upload response stream failed');
        expect(JSON.stringify(mocks.error.mock.calls)).not.toContain('private');
    });
});
