// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(), connect: vi.fn(), eval: vi.fn(), disconnect: vi.fn(), on: vi.fn() }));
vi.mock('ioredis', () => ({ default: class {
    constructor(...args: unknown[]) { mocks.create(...args); }
    connect = mocks.connect; eval = mocks.eval; disconnect = mocks.disconnect; on = mocks.on;
} }));
import { exchangePresence, PRESENCE_REDIS_TIMEOUT_MS, PresenceCapacityError, PresenceUnavailableError } from '../redis';
import { decodePresence, groupPresence, presenceKeys, presenceLeaseId, type PresenceLease } from '../service';

const key = { organizationId: 'org', socialAccountId: 'account', type: 'DM', entityId: 'thread' };
const actor = { id: 'user', name: 'Name' };
const now = 1_800_000_000_000;
const row = (extra: Partial<PresenceLease> = {}): PresenceLease => ({ userId: 'other', name: 'Other', state: 'viewing', updatedAt: now, ...extra });
beforeEach(() => {
    vi.resetAllMocks();
    mocks.connect.mockResolvedValue(undefined);
    mocks.eval.mockResolvedValue([String(now)]);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('presence identities and aggregation', () => {
    it('isolates tenant, account, entity and type, with same-slot keys and unambiguous tuples', () => {
        const base = presenceKeys(key);
        expect(base[0].match(/\{.*\}/)?.[0]).toBe(base[1].match(/\{.*\}/)?.[0]);
        for (const field of Object.keys(key) as (keyof typeof key)[]) {
            expect(presenceKeys({ ...key, [field]: 'different' })).not.toEqual(base);
        }
        expect(presenceKeys({ ...key, organizationId: 'a:b', socialAccountId: 'c' }))
            .not.toEqual(presenceKeys({ ...key, organizationId: 'a', socialAccountId: 'b:c' }));
        expect(presenceLeaseId('a:b', 'c')).not.toBe(presenceLeaseId('a', 'b:c'));
        expect(presenceLeaseId('user', 'tab')).not.toBe(presenceLeaseId('other', 'tab'));
    });

    it('excludes all own tabs, prunes exact expiry, and groups highest activity rather than newest lower state', () => {
        expect(groupPresence([
            row({ userId: 'user' }), row({ userId: 'user', state: 'replying' }),
            row({ state: 'replying', updatedAt: now - 10 }), row({ state: 'noting' }), row(),
            row({ userId: 'expired', updatedAt: now - 45000 }),
            row({ userId: 'active', updatedAt: now - 44999 }),
            row({ state: 'replying', updatedAt: now - 5, name: 'Newest high activity' }),
        ], 'user', now)).toEqual([
            { userId: 'active', name: 'Other', state: 'viewing', updatedAt: new Date(now - 44999).toISOString() },
            { userId: 'other', name: 'Newest high activity', state: 'replying', updatedAt: new Date(now - 5).toISOString() },
        ]);
    });

    it('preserves another tab after releasing one and falls back as high-priority leases expire', () => {
        const leases = new Map([
            [presenceLeaseId('other', 'tab1'), row({ state: 'replying', updatedAt: now - 44000 })],
            [presenceLeaseId('other', 'tab2'), row({ state: 'noting' })],
        ]);
        expect(groupPresence([...leases.values()], 'user', now)[0].state).toBe('replying');
        expect(groupPresence([...leases.values()], 'user', now + 1000)[0].state).toBe('noting');
        leases.delete(presenceLeaseId('user', 'tab2'));
        expect(leases.size).toBe(2);
        leases.delete(presenceLeaseId('other', 'tab1'));
        expect(groupPresence([...leases.values()], 'user', now)[0].state).toBe('noting');
        expect(groupPresence([...leases.values()], 'user', now + 45000)).toEqual([]);
    });

    it('rejects malformed, oversized or corrupt Redis snapshots', () => {
        for (const result of [null, [], ['NaN'], [String(now), '{'], [String(now), '{}'],
            [String(now), JSON.stringify(row({ state: 'typing' as 'viewing' }))], Array(202).fill(String(now))]) {
            expect(() => decodePresence(result, 'user')).toThrow();
        }
    });
});

describe('bounded Redis transport', () => {
    it('uses app env, no retries/offline queue, and an atomic scoped script with a 45s TTL and workload cap', async () => {
        vi.stubEnv('REDIS_URL', 'redis://test-only:6380');
        mocks.eval.mockResolvedValue([String(now), JSON.stringify(row()), JSON.stringify(row({ userId: actor.id }))]);
        const data = await exchangePresence(key, actor, { kind: 'put', tabId: 'tab', state: 'replying' });
        expect(data).toEqual({ participants: [{ ...row(), updatedAt: new Date(now).toISOString() }], ttlSeconds: 45 });
        const [url, options] = mocks.create.mock.calls[0];
        expect(url).toBe('redis://test-only:6380');
        expect(options).toMatchObject({ lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0, connectTimeout: 1000, commandTimeout: 1000 });
        expect(options.retryStrategy(1)).toBeNull();
        expect(options.reconnectOnError(new Error())).toBe(false);
        expect(mocks.eval.mock.calls[0].slice(1)).toEqual([2, ...presenceKeys(key), 'put', presenceLeaseId(actor.id, 'tab'),
            JSON.stringify({ userId: actor.id, name: actor.name, state: 'replying' }), 45000, 200]);
        expect(mocks.disconnect).toHaveBeenCalledOnce();
    });

    it('deletes only the requested actor/tab field; different users sharing a tab remain distinct', async () => {
        await exchangePresence(key, actor, { kind: 'delete', tabId: 'tab1' });
        await exchangePresence(key, actor, { kind: 'delete', tabId: 'tab2' });
        await exchangePresence(key, { ...actor, id: 'other' }, { kind: 'delete', tabId: 'tab1' });
        expect(mocks.eval.mock.calls.map((args) => args[5])).toEqual([
            presenceLeaseId(actor.id, 'tab1'), presenceLeaseId(actor.id, 'tab2'), presenceLeaseId('other', 'tab1'),
        ]);
    });

    it('maps connection, command and corrupt response failures to unavailable and always disconnects', async () => {
        mocks.connect.mockRejectedValueOnce(new Error('connect failed'));
        await expect(exchangePresence(key, actor, { kind: 'get' })).rejects.toBeInstanceOf(PresenceUnavailableError);
        expect(mocks.eval).not.toHaveBeenCalled();
        mocks.eval.mockRejectedValueOnce(new Error('command failed')).mockResolvedValueOnce(['bad']);
        for (let i = 0; i < 2; i++) await expect(exchangePresence(key, actor, { kind: 'get' })).rejects.toBeInstanceOf(PresenceUnavailableError);
        expect(mocks.disconnect).toHaveBeenCalledTimes(3);
    });

    it.each(['connect', 'eval'] as const)('bounds a hanging %s to the total deadline and disconnects', async (phase) => {
        vi.useFakeTimers();
        mocks[phase].mockImplementation(() => new Promise(() => undefined));
        const result = expect(exchangePresence(key, actor, { kind: 'get' })).rejects.toBeInstanceOf(PresenceUnavailableError);
        await vi.advanceTimersByTimeAsync(PRESENCE_REDIS_TIMEOUT_MS);
        await result;
        expect(mocks.disconnect).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('surfaces capacity separately and treats oversized storage as unavailable', async () => {
        mocks.eval.mockRejectedValueOnce(new Error('PRESENCE_CAPACITY')).mockRejectedValueOnce(new Error('PRESENCE_OVERSIZED'));
        await expect(exchangePresence(key, actor, { kind: 'put', tabId: 'tab', state: 'viewing' })).rejects.toBeInstanceOf(PresenceCapacityError);
        await expect(exchangePresence(key, actor, { kind: 'get' })).rejects.toBeInstanceOf(PresenceUnavailableError);
    });
});
