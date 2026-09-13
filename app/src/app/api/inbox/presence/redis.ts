import Redis from 'ioredis';
import {
    decodePresence, MAX_PRESENCE_LEASES, PRESENCE_TTL_SECONDS, presenceKeys, presenceLeaseId,
    type PresenceKey, type PresenceOperation,
} from './service';

export const PRESENCE_REDIS_TIMEOUT_MS = 1000;
export class PresenceUnavailableError extends Error {
    constructor() { super('Inbox presence unavailable; retry shortly'); }
}
export class PresenceCapacityError extends Error {
    constructor() { super('Inbox presence capacity reached; retry after leases expire'); }
}

/**
 * One atomic operation: prune, mutate just this user/tab, and return a bounded snapshot.
 * Redis TIME avoids clock skew across application instances. Reads do not renew leases.
 * All writers enforce the cap, so even pruning and HVALS have bounded work.
 */
export const PRESENCE_SCRIPT = `
local leases, expiry = KEYS[1], KEYS[2]
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local ttl, cap = tonumber(ARGV[4]), tonumber(ARGV[5])
if redis.call('ZCARD', expiry) > cap or redis.call('HLEN', leases) > cap then
    return redis.error_reply('PRESENCE_OVERSIZED')
end
local stale = redis.call('ZRANGEBYSCORE', expiry, '-inf', now, 'LIMIT', 0, cap)
for _, id in ipairs(stale) do
    redis.call('HDEL', leases, id)
    redis.call('ZREM', expiry, id)
end
if ARGV[1] == 'put' then
    if redis.call('HEXISTS', leases, ARGV[2]) == 0 and redis.call('HLEN', leases) >= cap then
        return redis.error_reply('PRESENCE_CAPACITY')
    end
    local value = cjson.decode(ARGV[3])
    value.updatedAt = now
    redis.call('HSET', leases, ARGV[2], cjson.encode(value))
    redis.call('ZADD', expiry, now + ttl, ARGV[2])
    redis.call('PEXPIRE', leases, ttl)
    redis.call('PEXPIRE', expiry, ttl)
elseif ARGV[1] == 'delete' then
    redis.call('HDEL', leases, ARGV[2])
    redis.call('ZREM', expiry, ARGV[2])
end
if redis.call('HLEN', leases) == 0 then redis.call('DEL', leases, expiry) end
local result = {string.format('%.0f', now)}
for _, value in ipairs(redis.call('HVALS', leases)) do table.insert(result, value) end
return result
`;

/** Dedicated short-lived connection: no BullMQ retry policy, offline queue or background retries. */
export async function exchangePresence(key: PresenceKey, actor: { id: string; name: string }, operation: PresenceOperation) {
    let client: Redis | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
            lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0,
            retryStrategy: () => null, reconnectOnError: () => false,
            connectTimeout: PRESENCE_REDIS_TIMEOUT_MS, commandTimeout: PRESENCE_REDIS_TIMEOUT_MS,
        });
        client.on('error', () => { /* surfaced through connect/eval, not an unhandled event */ });
        const redis = client;
        const run = async () => {
            await redis.connect();
            const leaseId = operation.kind === 'get' ? '' : presenceLeaseId(actor.id, operation.tabId);
            const value = operation.kind === 'put'
                ? JSON.stringify({ userId: actor.id, name: actor.name.slice(0, 256), state: operation.state }) : '';
            const result = await redis.eval(PRESENCE_SCRIPT, 2, ...presenceKeys(key),
                operation.kind, leaseId, value, PRESENCE_TTL_SECONDS * 1000, MAX_PRESENCE_LEASES);
            return decodePresence(result, actor.id);
        };
        return await Promise.race([
            run(),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new PresenceUnavailableError()), PRESENCE_REDIS_TIMEOUT_MS);
            }),
        ]);
    } catch (error) {
        if (error instanceof Error && error.message === 'PRESENCE_CAPACITY') throw new PresenceCapacityError();
        throw new PresenceUnavailableError();
    } finally {
        if (timer) clearTimeout(timer);
        client?.disconnect();
    }
}
