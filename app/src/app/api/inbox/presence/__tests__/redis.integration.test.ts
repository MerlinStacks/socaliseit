// @vitest-environment node
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PRESENCE_SCRIPT } from '../redis';
import { decodePresence, presenceKeys, presenceLeaseId } from '../service';

// Explicit opt-in only: never fall back to the application's Redis or scan/flush keys.
const testUrl = process.env.INBOX_PRESENCE_TEST_REDIS_URL;
describe.skipIf(!testUrl)('presence Lua against isolated test Redis', () => {
    let redis: Redis;
    const keys = presenceKeys({ organizationId: `presence-test-${randomUUID()}`, socialAccountId: 'account', type: 'DM', entityId: 'thread' });
    const execute = (kind: 'get' | 'put' | 'delete', userId = 'user', tabId = 'tab1', state = 'viewing', cap = 200) =>
        redis.eval(PRESENCE_SCRIPT, 2, ...keys, kind, presenceLeaseId(userId, tabId),
            kind === 'put' ? JSON.stringify({ userId, name: userId, state }) : '', 45000, cap);

    beforeAll(async () => {
        redis = new Redis(testUrl!, { lazyConnect: true, enableOfflineQueue: false, retryStrategy: () => null,
            maxRetriesPerRequest: 0, connectTimeout: 1000, commandTimeout: 1000 });
        redis.on('error', () => undefined);
        await redis.connect();
    });
    beforeEach(async () => { await redis.del(...keys); });
    afterAll(async () => {
        if (redis?.status === 'ready') await redis.del(...keys);
        redis?.disconnect();
    });

    it('atomically preserves concurrent tabs/users and only releases the specified user/tab', async () => {
        await Promise.all([
            execute('put', 'user', 'tab1', 'replying'), execute('put', 'user', 'tab2', 'noting'),
            execute('put', 'other', 'tab1', 'viewing'),
        ]);
        expect(await redis.hlen(keys[0])).toBe(3);
        let data = decodePresence(await execute('get'), 'observer');
        expect(data.participants.map(({ userId, state }) => ({ userId, state }))).toEqual([
            { userId: 'other', state: 'viewing' }, { userId: 'user', state: 'replying' },
        ]);
        await execute('delete', 'user', 'tab1');
        await execute('delete', 'user', 'tab1');
        data = decodePresence(await execute('get'), 'observer');
        expect(data.participants.find((p) => p.userId === 'user')?.state).toBe('noting');
        expect(data.participants.find((p) => p.userId === 'other')?.state).toBe('viewing');
        expect(decodePresence(await execute('get'), 'user').participants.map((p) => p.userId)).toEqual(['other']);
    });

    it('prunes expired individual leases without deleting another tab and never renews TTL on reads', async () => {
        await execute('put', 'user', 'tab2', 'noting');
        await execute('put', 'other', 'tab1', 'viewing');
        const expiredId = presenceLeaseId('user', 'tab2');
        await redis.zadd(keys[1], 0, expiredId);
        const before = await redis.pttl(keys[0]);
        expect(before).toBeGreaterThan(0);
        expect(before).toBeLessThanOrEqual(45000);
        expect(decodePresence(await execute('get'), 'observer').participants.map((p) => p.userId)).toEqual(['other']);
        expect(await redis.hexists(keys[0], expiredId)).toBe(0);
        expect(await redis.zscore(keys[1], expiredId)).toBeNull();
        expect(await redis.pttl(keys[0])).toBeLessThanOrEqual(before);
        await execute('delete', 'other', 'tab1');
        expect(await redis.exists(...keys)).toBe(0);
    });

    it('enforces capacity under concurrent writes while allowing refresh, then expires idle keys', async () => {
        const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => execute('put', 'user', `tab${i}`, 'viewing', 3)));
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
        for (const result of results) if (result.status === 'rejected') expect(result.reason.message).toBe('PRESENCE_CAPACITY');
        expect(await redis.hlen(keys[0])).toBe(3);
        expect(await redis.zcard(keys[1])).toBe(3);
        const leaseId = (await redis.hkeys(keys[0]))[0];
        const [userId, tabId] = JSON.parse(leaseId) as [string, string];
        await execute('put', userId, tabId, 'replying', 3);
        expect(await redis.hlen(keys[0])).toBe(3);
        // Accelerate only these randomly namespaced test keys, not the application's TTL.
        await Promise.all(keys.map((key) => redis.pexpire(key, 1)));
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(decodePresence(await execute('get'), 'observer')).toEqual({ participants: [], ttlSeconds: 45 });
        expect(await redis.exists(...keys)).toBe(0);
    });
});
