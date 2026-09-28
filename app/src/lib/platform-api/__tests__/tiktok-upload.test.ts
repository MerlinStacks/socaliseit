// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadTikTokChunk } from '../tiktok-upload';

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));
const fetchMock = vi.fn();
const url = 'https://upload.tiktokapis.com/video/?upload_token=secret';
const request = {
    method: 'PUT', body: Buffer.from('video'),
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': '5', 'Content-Range': 'bytes 0-4/5' },
};
const context = { publishId: 'session', chunk: 1 };

beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('TikTok chunk transfer retries', () => {
    it('recovers from CloudFront 503 using the identical session, bytes and range', async () => {
        const unavailable = new Response('CloudFront unavailable', { status: 503 });
        fetchMock.mockResolvedValueOnce(unavailable).mockResolvedValueOnce(new Response(null, { status: 201 }));
        const pending = uploadTikTokChunk(url, request, context);
        await vi.advanceTimersByTimeAsync(2_000);
        expect((await pending).status).toBe(201);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        for (const [calledUrl, options] of fetchMock.mock.calls) {
            expect(calledUrl).toBe(url);
            expect(options).toMatchObject(request);
            expect(options.body).toBe(request.body);
        }
        expect(fetchMock.mock.calls[0][1].signal).toBe(fetchMock.mock.calls[1][1].signal);
        expect(unavailable.bodyUsed).toBe(true);
    });

    it('stops after three 5xx responses and preserves the final error for reconciliation', async () => {
        fetchMock.mockImplementation(async () => new Response('Unavailable', { status: 503 }));
        const pending = uploadTikTokChunk(url, request, context);
        await vi.advanceTimersByTimeAsync(6_000);
        const response = await pending;
        expect(response.status).toBe(503);
        expect(await response.text()).toBe('Unavailable');
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it.each([201, 206, 400, 403, 404, 416])('does not retry HTTP %s', async status => {
        fetchMock.mockResolvedValue(new Response(null, { status }));
        expect((await uploadTikTokChunk(url, request, context)).status).toBe(status);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('honors Retry-After before resending', async () => {
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 503, headers: { 'Retry-After': '10' } }))
            .mockResolvedValueOnce(new Response(null, { status: 201 }));
        const pending = uploadTikTokChunk(url, request, context);
        await vi.advanceTimersByTimeAsync(9_999);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect((await pending).status).toBe(201);
    });

    it('does not wait beyond the chunk budget for Retry-After', async () => {
        fetchMock.mockResolvedValue(new Response(null, { status: 503, headers: { 'Retry-After': '120' } }));
        expect((await uploadTikTokChunk(url, request, context)).status).toBe(503);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('preserves uncertain network failures without starting another transfer', async () => {
        fetchMock.mockRejectedValue(new TypeError('fetch failed'));
        await expect(uploadTikTokChunk(url, request, context)).rejects.toThrow('fetch failed');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
