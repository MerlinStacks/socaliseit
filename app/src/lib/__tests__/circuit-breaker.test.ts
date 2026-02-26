/**
 * Unit Tests for Circuit Breaker
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Why: Mock Redis before importing the module so all Redis calls are intercepted
const mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    multi: vi.fn(),
    expire: vi.fn(),
};

const mockPipeline = {
    set: vi.fn().mockReturnThis(),
    del: vi.fn().mockReturnThis(),
    incr: vi.fn().mockReturnThis(),
    incrby: vi.fn().mockReturnThis(),
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
    getCircuitStatus,
    isCallAllowed,
    recordSuccess,
    recordFailure,
    withCircuitBreaker,
    CircuitOpenError,
} from '@/lib/resilience/circuit-breaker';

beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.multi.mockReturnValue(mockPipeline);
    mockPipeline.exec.mockResolvedValue([]);
});

describe('getCircuitStatus', () => {
    it('returns CLOSED when no state exists', async () => {
        mockRedis.get.mockResolvedValue(null);
        const status = await getCircuitStatus('instagram');
        expect(status.state).toBe('CLOSED');
    });

    it('returns OPEN when state is OPEN', async () => {
        mockRedis.get
            .mockResolvedValueOnce('OPEN')   // state
            .mockResolvedValueOnce('2')      // failures
            .mockResolvedValueOnce('1234')   // openedAt
            .mockResolvedValueOnce('0');      // halfOpenOk
        const status = await getCircuitStatus('tiktok');
        expect(status.state).toBe('OPEN');
        expect(status.failureCount).toBe(2);
    });
});

describe('isCallAllowed', () => {
    it('allows calls when circuit is CLOSED', async () => {
        mockRedis.get.mockResolvedValue(null);
        expect(await isCallAllowed('instagram')).toBe(true);
    });

    it('allows calls when circuit is HALF_OPEN (probing)', async () => {
        mockRedis.get.mockResolvedValue('HALF_OPEN');
        expect(await isCallAllowed('instagram')).toBe(true);
    });

    it('blocks calls when circuit is OPEN and reset timeout has not elapsed', async () => {
        mockRedis.get
            .mockResolvedValueOnce('OPEN')                    // state
            .mockResolvedValueOnce(String(Date.now()));       // openedAt (just now)
        expect(await isCallAllowed('instagram')).toBe(false);
    });

    it('transitions to HALF_OPEN when reset timeout has elapsed', async () => {
        const pastTimestamp = Date.now() - 300_000; // 5 minutes ago
        mockRedis.get
            .mockResolvedValueOnce('OPEN')                   // state
            .mockResolvedValueOnce(String(pastTimestamp));    // openedAt
        expect(await isCallAllowed('instagram')).toBe(true);
        // Should have called multi to transition state
        expect(mockRedis.multi).toHaveBeenCalled();
    });
});

describe('recordFailure', () => {
    it('trips to OPEN after threshold failures', async () => {
        mockRedis.get.mockResolvedValue(null); // state = CLOSED
        // Simulate failure count reaching threshold (5)
        mockPipeline.exec.mockResolvedValue([[null, 5], [null, 1]]);

        await recordFailure('facebook');

        // Should have called multi twice: once for increment, once for state transition
        expect(mockRedis.multi).toHaveBeenCalledTimes(2);
    });

    it('re-opens circuit on failure during HALF_OPEN', async () => {
        mockRedis.get.mockResolvedValue('HALF_OPEN');

        await recordFailure('facebook');

        // Should transition to OPEN
        expect(mockRedis.multi).toHaveBeenCalled();
        expect(mockPipeline.set).toHaveBeenCalledWith(
            expect.stringContaining('state'),
            'OPEN',
        );
    });
});

describe('recordSuccess', () => {
    it('transitions HALF_OPEN to CLOSED after enough successes', async () => {
        mockRedis.get.mockResolvedValue('HALF_OPEN');
        mockRedis.incr.mockResolvedValue(2); // halfOpenSuccessThreshold = 2

        await recordSuccess('facebook');

        expect(mockRedis.multi).toHaveBeenCalled();
        expect(mockPipeline.set).toHaveBeenCalledWith(
            expect.stringContaining('state'),
            'CLOSED',
        );
    });

    it('does nothing on success when CLOSED', async () => {
        mockRedis.get.mockResolvedValue(null);
        await recordSuccess('facebook');
        // Should not attempt state transition
        expect(mockPipeline.set).not.toHaveBeenCalledWith(
            expect.stringContaining('state'),
            expect.any(String),
        );
    });
});

describe('withCircuitBreaker', () => {
    it('executes operation when circuit is CLOSED', async () => {
        mockRedis.get.mockResolvedValue(null); // CLOSED
        mockRedis.incr.mockResolvedValue(1);

        const result = await withCircuitBreaker('instagram', async () => 'success');
        expect(result).toBe('success');
    });

    it('throws CircuitOpenError when circuit is OPEN', async () => {
        mockRedis.get.mockImplementation(async (key: string) => {
            if (key.includes('state')) return 'OPEN';
            if (key.includes('opened_at')) return String(Date.now()); // Just opened
            return null;
        });

        await expect(
            withCircuitBreaker('instagram', async () => 'should not run'),
        ).rejects.toThrow(CircuitOpenError);
    });

    it('records failure when operation throws', async () => {
        mockRedis.get.mockResolvedValue(null); // CLOSED
        mockPipeline.exec.mockResolvedValue([[null, 1], [null, 1]]);

        await expect(
            withCircuitBreaker('instagram', async () => { throw new Error('api error'); }),
        ).rejects.toThrow('api error');

        // Should have called multi for failure recording
        expect(mockRedis.multi).toHaveBeenCalled();
    });
});
