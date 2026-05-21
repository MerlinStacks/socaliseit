import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRedis = {
    set: vi.fn(),
    get: vi.fn(),
    exists: vi.fn(),
    eval: vi.fn(),
    del: vi.fn(),
};

vi.mock('@/lib/bullmq/connection', () => ({
    getRedisConnection: () => mockRedis,
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { acquirePublishLock, isPublishLocked } from '../publish-lock';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('publish lock fail-safe behaviour', () => {
    it('does not acquire a fallback lock when Redis acquisition fails', async () => {
        mockRedis.set.mockRejectedValueOnce(new Error('redis unavailable'));

        await expect(acquirePublishLock('post-1')).resolves.toBeNull();
    });

    it('treats unknown lock state as locked when Redis check fails', async () => {
        mockRedis.exists.mockRejectedValueOnce(new Error('redis unavailable'));

        await expect(isPublishLocked('post-1')).resolves.toBe(true);
    });
});
