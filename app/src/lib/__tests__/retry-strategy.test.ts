/**
 * Unit Tests for Retry Strategy
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyError, withRetry, type ClassifiedError } from '@/lib/resilience/retry-strategy';

// Mock the logger to avoid noise in tests
vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

describe('classifyError', () => {
    it('classifies timeout errors as retryable', () => {
        const result = classifyError(new Error('Request timed out after 60000ms'));
        expect(result.retryability).toBe('retryable');
        expect(result.category).toBe('timeout');
    });

    it('classifies 429 errors as retryable with rate_limit category', () => {
        const result = classifyError(new Error('429 Too Many Requests'));
        expect(result.retryability).toBe('retryable');
        expect(result.category).toBe('rate_limit');
    });

    it('classifies 500 errors as retryable server_error', () => {
        const result = classifyError(new Error('Internal server error (500)'));
        expect(result.retryability).toBe('retryable');
        expect(result.category).toBe('server_error');
    });

    it('classifies 503 errors as retryable server_error', () => {
        const result = classifyError(new Error('503 Service Unavailable'));
        expect(result.retryability).toBe('retryable');
        expect(result.category).toBe('server_error');
    });

    it('classifies network errors as retryable', () => {
        const result = classifyError(new Error('ECONNRESET'));
        expect(result.retryability).toBe('retryable');
        expect(result.category).toBe('network');
    });

    it('classifies ECONNREFUSED as retryable network error', () => {
        const result = classifyError(new Error('ECONNREFUSED 127.0.0.1:443'));
        expect(result.retryability).toBe('retryable');
        expect(result.category).toBe('network');
    });

    it('classifies 400 bad request as permanent', () => {
        const result = classifyError(new Error('400 Bad Request: invalid parameter'));
        expect(result.retryability).toBe('permanent');
        expect(result.category).toBe('validation');
    });

    it('classifies 401 unauthorized as permanent', () => {
        const result = classifyError(new Error('401 Unauthorized'));
        expect(result.retryability).toBe('permanent');
        expect(result.category).toBe('auth');
    });

    it('classifies token expired as permanent auth', () => {
        const result = classifyError(new Error('token expired'));
        expect(result.retryability).toBe('permanent');
        expect(result.category).toBe('auth');
    });

    it('classifies duplicate errors as permanent', () => {
        const result = classifyError(new Error('Post already exists'));
        expect(result.retryability).toBe('permanent');
        expect(result.category).toBe('validation');
    });

    it('classifies blocked hashtag as permanent', () => {
        const result = classifyError(new Error('blocked hashtag detected'));
        expect(result.retryability).toBe('permanent');
        expect(result.category).toBe('validation');
    });

    it('defaults unknown errors to retryable', () => {
        const result = classifyError(new Error('something completely unexpected'));
        expect(result.retryability).toBe('retryable');
        expect(result.category).toBe('unknown');
    });

    it('handles string errors', () => {
        const result = classifyError('connection timeout');
        expect(result.retryability).toBe('retryable');
        expect(result.category).toBe('timeout');
    });

    it('classifies publish timeout (isPublishTimeout flag) as permanent', () => {
        const err = new Error('Publishing to TIKTOK timed out after 840s. The platform API may be unresponsive.');
        (err as any).isPublishTimeout = true;
        const result = classifyError(err);
        expect(result.retryability).toBe('permanent');
        expect(result.category).toBe('timeout');
    });

    it('classifies errors with pendingPostId containing _pending: as permanent', () => {
        const err = new Error('Publishing failed');
        (err as any).pendingPostId = 'tiktok_pending:v_pub_123';
        const result = classifyError(err);
        expect(result.retryability).toBe('permanent');
        expect(result.category).toBe('timeout');
    });

    it('extracts suggested delay from rate limit errors', () => {
        const result = classifyError(new Error('Rate limit exceeded. Retry after 60 seconds'));
        expect(result.retryability).toBe('retryable');
        expect(result.category).toBe('rate_limit');
        expect(result.suggestedDelayMs).toBe(60000);
    });
});

describe('withRetry', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    it('returns immediately on success', async () => {
        const op = vi.fn().mockResolvedValue('ok');
        const result = await withRetry(op, { maxAttempts: 3 });
        expect(result).toBe('ok');
        expect(op).toHaveBeenCalledTimes(1);
    });

    it('throws immediately on permanent errors without retrying', async () => {
        const op = vi.fn().mockRejectedValue(new Error('400 Bad Request'));
        await expect(withRetry(op, { maxAttempts: 3 })).rejects.toThrow('400 Bad Request');
        expect(op).toHaveBeenCalledTimes(1);
    });

    it('retries on transient errors and succeeds', async () => {
        const op = vi.fn()
            .mockRejectedValueOnce(new Error('ECONNRESET'))
            .mockResolvedValueOnce('recovered');

        const result = await withRetry(op, { maxAttempts: 3, baseDelayMs: 10 });
        expect(result).toBe('recovered');
        expect(op).toHaveBeenCalledTimes(2);
    });

    it('exhausts all attempts and throws the last error', async () => {
        const op = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
        await expect(withRetry(op, { maxAttempts: 3, baseDelayMs: 10 })).rejects.toThrow('ECONNRESET');
        expect(op).toHaveBeenCalledTimes(3);
    });

    it('calls onRetry callback on each retry', async () => {
        const onRetry = vi.fn();
        const op = vi.fn()
            .mockRejectedValueOnce(new Error('timeout'))
            .mockResolvedValueOnce('ok');

        await withRetry(op, { maxAttempts: 3, baseDelayMs: 10, onRetry });
        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(onRetry).toHaveBeenCalledWith(
            1,
            expect.any(Error),
            expect.objectContaining({ retryability: 'retryable' }),
            expect.any(Number),
        );
    });

    it('applies platform delay multiplier', async () => {
        const onRetry = vi.fn();
        const op = vi.fn()
            .mockRejectedValueOnce(new Error('timeout'))
            .mockResolvedValueOnce('ok');

        await withRetry(op, { maxAttempts: 3, baseDelayMs: 100, platform: 'instagram', onRetry });
        // Instagram has 2.0x multiplier, so delay should be >= 200ms (100 * 2^0 * 2.0)
        const delayMs = onRetry.mock.calls[0][3];
        expect(delayMs).toBeGreaterThanOrEqual(200);
    });
});
