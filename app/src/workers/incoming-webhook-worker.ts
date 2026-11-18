import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { isRecord } from '@/lib/utils';
import { processWebhook, type WebhookType } from '@/lib/webhooks';

const POLL_MS = 5_000;
const LEASE_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const DAY_MS = 24 * 60 * 60_000;

export async function drainIncomingWebhooks(shouldStop = () => false) {
    const now = new Date();
    const deliveries = await db.incomingWebhook.findMany({
        where: { runAt: { lte: now } }, orderBy: [{ runAt: 'asc' }, { id: 'asc' }], take: 25,
    });

    for (const delivery of deliveries) {
        if (shouldStop()) return;
        const lease = new Date(Date.now() + LEASE_MS);
        // Claim atomically. An interrupted worker leaves the payload available
        // after the lease expires, and a stale worker cannot settle a new lease.
        const claimed = await db.incomingWebhook.updateMany({
            where: { id: delivery.id, runAt: delivery.runAt }, data: { runAt: lease },
        });
        if (!claimed.count) continue;

        try {
            if (!isRecord(delivery.payload)) throw new Error('Invalid stored webhook payload');
            await processWebhook(delivery.type as WebhookType, delivery.payload);
        } catch (err) {
            const attempts = delivery.attempts + 1;
            const exhausted = attempts >= MAX_ATTEMPTS;
            await db.incomingWebhook.updateMany({
                where: { id: delivery.id, runAt: lease },
                data: {
                    attempts,
                    runAt: exhausted ? null : new Date(Date.now() + 30_000 * 2 ** (attempts - 1)),
                    expiresAt: exhausted ? new Date(Date.now() + 7 * DAY_MS) : null,
                },
            });
            logger.error({ err, deliveryId: delivery.id, type: delivery.type, attempts, exhausted }, 'Incoming webhook processing failed');
            continue;
        }

        await db.incomingWebhook.updateMany({
            where: { id: delivery.id, runAt: lease },
            // Keep the ID for provider retries, not the processed payload.
            data: { payload: Prisma.DbNull, runAt: null, expiresAt: new Date(Date.now() + DAY_MS) },
        });
    }

    await db.incomingWebhook.deleteMany({ where: { expiresAt: { lte: now } } });
}

export function createIncomingWebhookWorker() {
    let closed = false;
    let timer: ReturnType<typeof setTimeout>;
    let current: Promise<void>;
    const poll = () => {
        current = drainIncomingWebhooks(() => closed)
            .catch(err => logger.error({ err }, 'Incoming webhook inbox polling failed'))
            .finally(() => {
                if (!closed) timer = setTimeout(poll, POLL_MS);
            });
    };
    poll();
    return {
        async close() {
            closed = true;
            clearTimeout(timer);
            await current;
        },
    };
}
