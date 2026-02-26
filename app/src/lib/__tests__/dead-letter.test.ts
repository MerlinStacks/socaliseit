/**
 * Unit Tests for Dead-Letter Queue
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRedis = {
    zadd: vi.fn(),
    zrem: vi.fn(),
    zrange: vi.fn(),
    zrevrange: vi.fn(),
    zcard: vi.fn(),
    multi: vi.fn(),
    expire: vi.fn(),
};

const mockPipeline = {
    zadd: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
};

mockRedis.multi.mockReturnValue(mockPipeline);

vi.mock('@/lib/bullmq/connection', () => ({
    getRedisConnection: () => mockRedis,
    getBullMQConnection: () => ({}),
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/push-notifications', () => ({
    sendPostFailedNotification: vi.fn().mockResolvedValue(undefined),
}));

import {
    moveToDeadLetter,
    removeFromDeadLetter,
    listDeadLetterPosts,
    getDeadLetterCount,
} from '@/lib/resilience/dead-letter';

beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.multi.mockReturnValue(mockPipeline);
    mockPipeline.exec.mockResolvedValue([]);
});

describe('moveToDeadLetter', () => {
    it('adds post to the dead-letter sorted set', async () => {
        await moveToDeadLetter('post-1', 'org-1', 'API timeout', 'instagram', 3);

        expect(mockPipeline.zadd).toHaveBeenCalledWith(
            'dlq:publish',
            expect.any(Number),
            expect.stringContaining('"postId":"post-1"'),
        );
    });

    it('sets TTL on the DLQ key', async () => {
        await moveToDeadLetter('post-2', 'org-1', 'error');

        expect(mockPipeline.expire).toHaveBeenCalledWith(
            'dlq:publish',
            30 * 24 * 60 * 60, // 30 days
        );
    });

    it('truncates long error messages', async () => {
        const longError = 'x'.repeat(1000);
        await moveToDeadLetter('post-3', 'org-1', longError);

        const addedEntry = mockPipeline.zadd.mock.calls[0][2];
        const parsed = JSON.parse(addedEntry);
        expect(parsed.errorMessage.length).toBeLessThanOrEqual(500);
    });
});

describe('removeFromDeadLetter', () => {
    it('removes the matching entry by postId', async () => {
        const entry = JSON.stringify({ postId: 'post-1', organizationId: 'org-1', errorMessage: 'err', attemptsMade: 3, failedAt: new Date().toISOString() });
        mockRedis.zrange.mockResolvedValue([entry]);
        mockRedis.zrem.mockResolvedValue(1);

        const result = await removeFromDeadLetter('post-1');
        expect(result).toBe(true);
        expect(mockRedis.zrem).toHaveBeenCalledWith('dlq:publish', entry);
    });

    it('returns false when post is not found', async () => {
        mockRedis.zrange.mockResolvedValue([]);
        const result = await removeFromDeadLetter('nonexistent');
        expect(result).toBe(false);
    });
});

describe('listDeadLetterPosts', () => {
    it('returns parsed entries from sorted set', async () => {
        const entry = JSON.stringify({
            postId: 'post-1',
            organizationId: 'org-1',
            errorMessage: 'timeout',
            platform: 'tiktok',
            attemptsMade: 3,
            failedAt: '2026-02-27T00:00:00.000Z',
        });
        mockRedis.zrevrange.mockResolvedValue([entry, '1709067600000']);

        const posts = await listDeadLetterPosts(20, 0);
        expect(posts).toHaveLength(1);
        expect(posts[0].postId).toBe('post-1');
        expect(posts[0].platform).toBe('tiktok');
        expect(posts[0].failedAt).toBeInstanceOf(Date);
    });

    it('skips malformed entries', async () => {
        mockRedis.zrevrange.mockResolvedValue(['invalid-json', '12345']);
        const posts = await listDeadLetterPosts();
        expect(posts).toHaveLength(0);
    });

    it('returns empty array on Redis error', async () => {
        mockRedis.zrevrange.mockRejectedValue(new Error('Redis down'));
        const posts = await listDeadLetterPosts();
        expect(posts).toEqual([]);
    });
});

describe('getDeadLetterCount', () => {
    it('returns the cardinality of the sorted set', async () => {
        mockRedis.zcard.mockResolvedValue(5);
        expect(await getDeadLetterCount()).toBe(5);
    });

    it('returns 0 on Redis error', async () => {
        mockRedis.zcard.mockRejectedValue(new Error('Redis down'));
        expect(await getDeadLetterCount()).toBe(0);
    });
});
