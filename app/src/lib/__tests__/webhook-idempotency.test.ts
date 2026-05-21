import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRedis, mockDb } = vi.hoisted(() => ({
    mockRedis: {
        exists: vi.fn(),
        setex: vi.fn(),
        set: vi.fn(),
    },
    mockDb: {
        processedWebhookEvent: {
            findUnique: vi.fn(),
            create: vi.fn(),
        },
    },
}));

vi.mock('@/lib/bullmq/connection', () => ({
    getRedisConnection: () => mockRedis,
}));

vi.mock('@/lib/db', () => ({
    db: mockDb,
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { checkAndMarkWebhook, isWebhookProcessed, markWebhookProcessed } from '../webhook-idempotency';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('webhook idempotency Redis fallback', () => {
    it('uses DB fallback when checking processed status fails in Redis', async () => {
        mockRedis.exists.mockRejectedValueOnce(new Error('redis unavailable'));
        mockDb.processedWebhookEvent.findUnique.mockResolvedValueOnce({ eventId: 'evt-1' });

        await expect(isWebhookProcessed('evt-1')).resolves.toBe(true);
    });

    it('marks via DB fallback when Redis setex fails', async () => {
        mockRedis.setex.mockRejectedValueOnce(new Error('redis unavailable'));
        mockDb.processedWebhookEvent.create.mockResolvedValueOnce({ eventId: 'evt-1' });

        await markWebhookProcessed('evt-1');

        expect(mockDb.processedWebhookEvent.create).toHaveBeenCalledWith({ data: { eventId: 'evt-1' } });
    });

    it('allows a new webhook once via DB fallback when Redis atomic check fails', async () => {
        mockRedis.set.mockRejectedValueOnce(new Error('redis unavailable'));
        mockDb.processedWebhookEvent.create.mockResolvedValueOnce({ eventId: 'evt-1' });

        await expect(checkAndMarkWebhook('evt-1')).resolves.toBe(true);
    });

    it('skips duplicate webhooks via DB fallback unique constraint', async () => {
        mockRedis.set.mockRejectedValueOnce(new Error('redis unavailable'));
        mockDb.processedWebhookEvent.create.mockRejectedValueOnce({ code: 'P2002' });

        await expect(checkAndMarkWebhook('evt-1')).resolves.toBe(false);
    });
});
