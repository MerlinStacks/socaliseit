// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ eval: vi.fn() }));
vi.mock('@/lib/bullmq/connection', () => ({ getRedisConnection: () => ({ eval: mocks.eval }) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
import { checkRateLimit } from '@/lib/rate-limit';

beforeEach(() => { vi.resetAllMocks(); });

describe('MCP fail-closed quotas', () => {
    const quotas = [
        { prefix: 'ratelimit:auth:mcp', max: 60, windowSeconds: 60 },
        { prefix: 'ratelimit:auth:mcp-upload', max: 20, windowSeconds: 60 },
        { prefix: 'ratelimit:auth:mcp-upload-ip', max: 60, windowSeconds: 60 },
    ];
    it.each(quotas)('denies requests when Redis fails for $prefix', async quota => {
        mocks.eval.mockRejectedValueOnce(new Error('Redis unavailable'));
        expect(await checkRateLimit('client', quota)).toMatchObject({ allowed: false, remaining: 0, limit: quota.max });
    });
    it.each(quotas)('enforces the request limit for $prefix', async quota => {
        mocks.eval.mockResolvedValueOnce(quota.max - 1).mockResolvedValueOnce(quota.max);
        expect(await checkRateLimit('client', quota)).toMatchObject({ allowed: true, remaining: 0 });
        expect(await checkRateLimit('client', quota)).toMatchObject({ allowed: false, remaining: 0 });
        expect(mocks.eval.mock.calls[0][2]).toBe(`${quota.prefix}:client`);
    });
});
