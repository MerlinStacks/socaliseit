/**
 * Unit Tests for Platform Health Tracker
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
    lpush: vi.fn(),
    ltrim: vi.fn(),
    lrange: vi.fn(),
    multi: vi.fn(),
    expire: vi.fn(),
};

const mockPipeline = {
    lpush: vi.fn().mockReturnThis(),
    ltrim: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
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

import {
    recordOutcome,
    getHealthStatus,
    getAllPlatformHealth,
    isPlatformHealthy,
} from '@/lib/resilience/platform-health';

beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.multi.mockReturnValue(mockPipeline);
    mockPipeline.exec.mockResolvedValue([]);
});

describe('recordOutcome', () => {
    it('pushes "1" for success', async () => {
        await recordOutcome('instagram', true);
        expect(mockPipeline.lpush).toHaveBeenCalledWith(
            expect.stringContaining('instagram:outcomes'),
            '1',
        );
    });

    it('pushes "0" for failure', async () => {
        await recordOutcome('instagram', false);
        expect(mockPipeline.lpush).toHaveBeenCalledWith(
            expect.stringContaining('instagram:outcomes'),
            '0',
        );
    });

    it('trims to rolling window size', async () => {
        await recordOutcome('tiktok', true);
        expect(mockPipeline.ltrim).toHaveBeenCalledWith(
            expect.stringContaining('tiktok:outcomes'),
            0,
            99, // ROLLING_WINDOW_SIZE - 1
        );
    });

    it('normalises platform name to lowercase', async () => {
        await recordOutcome('Instagram', true);
        expect(mockPipeline.lpush).toHaveBeenCalledWith(
            expect.stringContaining('instagram:outcomes'),
            '1',
        );
    });
});

describe('getHealthStatus', () => {
    it('returns healthy with score 100 when no data exists', async () => {
        mockRedis.lrange.mockResolvedValue([]);
        mockRedis.get.mockResolvedValue(null);

        const status = await getHealthStatus('instagram');
        expect(status.score).toBe(100);
        expect(status.state).toBe('healthy');
        expect(status.total).toBe(0);
    });

    it('calculates score from success/failure ratio', async () => {
        // 8 successes, 2 failures = 80% = healthy
        const outcomes = Array(8).fill('1').concat(Array(2).fill('0'));
        mockRedis.lrange.mockResolvedValue(outcomes);
        mockRedis.get.mockResolvedValue(new Date().toISOString());

        const status = await getHealthStatus('instagram');
        expect(status.score).toBe(80);
        expect(status.state).toBe('healthy');
        expect(status.successes).toBe(8);
        expect(status.failures).toBe(2);
    });

    it('returns degraded state for scores between 50 and 80', async () => {
        // 6 successes, 4 failures = 60% = degraded
        const outcomes = Array(6).fill('1').concat(Array(4).fill('0'));
        mockRedis.lrange.mockResolvedValue(outcomes);
        mockRedis.get.mockResolvedValue(new Date().toISOString());

        const status = await getHealthStatus('tiktok');
        expect(status.score).toBe(60);
        expect(status.state).toBe('degraded');
    });

    it('returns down state for scores at or below 50', async () => {
        // 5 successes, 5 failures = 50% = down
        const outcomes = Array(5).fill('1').concat(Array(5).fill('0'));
        mockRedis.lrange.mockResolvedValue(outcomes);
        mockRedis.get.mockResolvedValue(new Date().toISOString());

        const status = await getHealthStatus('youtube');
        expect(status.score).toBe(50);
        expect(status.state).toBe('down');
    });

    it('returns down for 0% success rate', async () => {
        const outcomes = Array(10).fill('0');
        mockRedis.lrange.mockResolvedValue(outcomes);
        mockRedis.get.mockResolvedValue(new Date().toISOString());

        const status = await getHealthStatus('facebook');
        expect(status.score).toBe(0);
        expect(status.state).toBe('down');
    });
});

describe('isPlatformHealthy', () => {
    it('returns true when platform is healthy', async () => {
        mockRedis.lrange.mockResolvedValue(Array(10).fill('1'));
        mockRedis.get.mockResolvedValue(new Date().toISOString());

        expect(await isPlatformHealthy('instagram')).toBe(true);
    });

    it('returns true when platform is degraded', async () => {
        mockRedis.lrange.mockResolvedValue(Array(6).fill('1').concat(Array(4).fill('0')));
        mockRedis.get.mockResolvedValue(new Date().toISOString());

        expect(await isPlatformHealthy('instagram')).toBe(true);
    });

    it('returns false when platform is down', async () => {
        mockRedis.lrange.mockResolvedValue(Array(10).fill('0'));
        mockRedis.get.mockResolvedValue(new Date().toISOString());

        expect(await isPlatformHealthy('instagram')).toBe(false);
    });
});

describe('getAllPlatformHealth', () => {
    it('returns status for all 9 platforms', async () => {
        mockRedis.lrange.mockResolvedValue([]);
        mockRedis.get.mockResolvedValue(null);

        const all = await getAllPlatformHealth();
        expect(all).toHaveLength(9);
        expect(all.map((p) => p.platform)).toContain('instagram');
        expect(all.map((p) => p.platform)).toContain('tiktok');
        expect(all.map((p) => p.platform)).toContain('youtube');
    });
});
