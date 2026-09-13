import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from 'pino';
import type { SocialAccountModel } from '@/generated/prisma/models/SocialAccount';
const mocks = vi.hoisted(() => ({ publish: vi.fn(), token: vi.fn(), outcome: vi.fn(), create: vi.fn(), circuit: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { publishError: { create: mocks.create } } }));
vi.mock('@/lib/platforms', () => ({ publishToPlatform: mocks.publish }));
vi.mock('@/lib/services/token-service', () => ({ ensureValidToken: mocks.token }));
vi.mock('@/lib/resilience/platform-health', () => ({ recordOutcome: mocks.outcome }));
vi.mock('@/lib/resilience/circuit-breaker', () => ({ withCircuitBreaker: mocks.circuit, CircuitOpenError: class extends Error {} }));
import { publishSinglePlatform, PUBLISH_TIMEOUT_MS } from '../publish-helpers';
import { CircuitOpenError } from '@/lib/resilience/circuit-breaker';
const account = { id: 'account', platform: 'FACEBOOK' } as SocialAccountModel;
const payload = { caption: 'Hello' } as Parameters<typeof publishSinglePlatform>[1];
const log = { warn: vi.fn(), error: vi.fn(), info: vi.fn() } as unknown as Logger;
beforeEach(() => {
    vi.resetAllMocks();
    mocks.circuit.mockImplementation(async (_platform, operation) => operation());
    mocks.token.mockResolvedValue({ success: true, accessToken: 'token' });
    mocks.outcome.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue({});
});

describe('single platform outcome safety', () => {
    it('does not replay network failures after dispatch', async () => {
        mocks.publish.mockRejectedValue(new Error('ECONNRESET'));
        const result = await publishSinglePlatform(account, payload, 'post', log);
        expect(result).toMatchObject({ success: false, retrySafe: false, outcomeUnknown: true });
        expect(mocks.publish).toHaveBeenCalledTimes(1);
        expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ errorCode: 'PUBLISH_OUTCOME_UNKNOWN' }) });
    });
    it('preserves confirmed success when health recording fails', async () => {
        mocks.publish.mockResolvedValue({ success: true, postId: 'remote-id' });
        mocks.outcome.mockRejectedValue(new Error('Redis down'));
        await expect(publishSinglePlatform(account, payload, 'post', log)).resolves.toMatchObject({ success: true, postId: 'remote-id' });
        expect(mocks.create).not.toHaveBeenCalled();
    });
    it('returns a safe retry result for a circuit-open rejection before dispatch', async () => {
        mocks.circuit.mockRejectedValue(new CircuitOpenError('FACEBOOK'));
        await expect(publishSinglePlatform(account, payload, 'post', log)).resolves.toMatchObject({ success: false, retrySafe: true });
        expect(mocks.publish).not.toHaveBeenCalled();
    });
    it('preserves pending IDs without replaying the platform call', async () => {
        mocks.publish.mockResolvedValue({ success: false, postId: 'ig_pending:123', error: 'Still processing' });
        await expect(publishSinglePlatform(account, payload, 'post', log)).resolves.toMatchObject({ postId: 'ig_pending:123', retrySafe: false });
        expect(mocks.publish).toHaveBeenCalledTimes(1);
    });
    it('treats a timeout as unknown and never retries the still-running call', async () => {
        vi.useFakeTimers();
        try {
            mocks.publish.mockReturnValue(new Promise(() => {}));
            const result = publishSinglePlatform(account, payload, 'post', log);
            await vi.advanceTimersByTimeAsync(PUBLISH_TIMEOUT_MS);
            await expect(result).resolves.toMatchObject({ outcomeUnknown: true, retrySafe: false });
            expect(mocks.publish).toHaveBeenCalledTimes(1);
            expect(vi.getTimerCount()).toBe(0);
        } finally { vi.useRealTimers(); }
    });
});
