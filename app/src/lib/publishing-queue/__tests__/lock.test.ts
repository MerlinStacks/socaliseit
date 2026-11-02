// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const redis = vi.hoisted(() => ({ set: vi.fn(), eval: vi.fn() }));
vi.mock('@/lib/bullmq/connection', () => ({ getRedisConnection: () => redis }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
import { withQueueLock } from '../lock';
beforeEach(() => { vi.resetAllMocks(); redis.set.mockResolvedValue('OK'); redis.eval.mockResolvedValue(1); });
afterEach(() => { vi.useRealTimers(); });

it('fails closed when another allocator owns the profile, without running its writes', async () => {
    redis.set.mockResolvedValue(null);
    const operation = vi.fn();
    await expect(withQueueLock('profile:org:account', operation)).rejects.toThrow(/being updated/);
    expect(operation).not.toHaveBeenCalled();
});

it('uses workspace/profile identity and releases ownership even after failure', async () => {
    await expect(withQueueLock('profile:org:account', async () => { throw new Error('failure'); })).rejects.toThrow('failure');
    expect(redis.set).toHaveBeenCalledWith('publishing-queue-lock:profile:org:account', expect.any(String), 'EX', 120, 'NX');
    const token = redis.set.mock.calls[0][1];
    expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining('redis.call("get"'), 1, 'publishing-queue-lock:profile:org:account', token);
});

it('stops before the next mutation if lock renewal failed', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const waiting = new Promise<void>(resolve => { finish = resolve; });
    const mutation = vi.fn();
    const result = withQueueLock('profile:org:account', async assertOwned => { await waiting; assertOwned(); mutation(); });
    const rejected = expect(result).rejects.toThrow(/lock was lost/);
    await Promise.resolve();
    redis.eval.mockRejectedValueOnce(new Error('redis unavailable'));
    await vi.advanceTimersByTimeAsync(30_000);
    finish();
    await rejected;
    expect(mutation).not.toHaveBeenCalled();
});
