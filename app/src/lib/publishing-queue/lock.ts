import crypto from 'node:crypto';
import { getRedisConnection } from '@/lib/bullmq/connection';
import { logger } from '@/lib/logger';

export class QueueBusyError extends Error {
    readonly status = 409;
}

/** Shared across HTTP callers and worker processes; different posts can share one profile. */
export async function withQueueLock<T>(resource: string, operation: (assertOwned: () => void) => Promise<T>): Promise<T> {
    const redis = getRedisConnection();
    const key = `publishing-queue-lock:${resource}`;
    const token = crypto.randomUUID();
    if (await redis.set(key, token, 'EX', 120, 'NX') !== 'OK') {
        throw new QueueBusyError('This queue is being updated. Please retry shortly.');
    }
    let lost = false;
    const assertOwned = () => { if (lost) throw new QueueBusyError('Queue lock was lost. Refresh before retrying.'); };
    const heartbeat = setInterval(() => {
        void redis.eval('if redis.call("get",KEYS[1]) == ARGV[1] then return redis.call("expire",KEYS[1],120) else return 0 end', 1, key, token)
            .then(result => { if (result !== 1) lost = true; })
            .catch(() => { lost = true; });
    }, 30_000);
    heartbeat.unref?.();
    try {
        const result = await operation(assertOwned);
        assertOwned();
        return result;
    } finally {
        clearInterval(heartbeat);
        await redis.eval('if redis.call("get",KEYS[1]) == ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end', 1, key, token)
            .catch(err => logger.error({ err, resource }, 'Could not release publishing queue lock'));
    }
}
