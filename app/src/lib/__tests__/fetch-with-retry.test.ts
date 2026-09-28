import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithRetry } from '../fetch-with-retry';

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('bounded API retries', () => {
    it('recovers from a transient service failure', async () => {
        vi.useFakeTimers();
        const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 }))
            .mockResolvedValueOnce(new Response('ok'));
        vi.stubGlobal('fetch', fetch);
        const pending = fetchWithRetry('https://example.com');
        await vi.runAllTimersAsync();
        expect((await pending).status).toBe(200);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('stops after three transient failures', async () => {
        vi.useFakeTimers();
        const fetch = vi.fn().mockImplementation(async () => new Response('', { status: 503 }));
        vi.stubGlobal('fetch', fetch);
        const pending = fetchWithRetry('https://example.com');
        await vi.runAllTimersAsync();
        expect((await pending).status).toBe(503);
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('does not start a request after cancellation', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        await expect(fetchWithRetry('https://example.com', { signal: AbortSignal.abort() })).rejects.toThrow();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('does not retry invalid credentials', async () => {
        const fetch = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
        vi.stubGlobal('fetch', fetch);
        expect((await fetchWithRetry('https://example.com')).status).toBe(401);
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});
