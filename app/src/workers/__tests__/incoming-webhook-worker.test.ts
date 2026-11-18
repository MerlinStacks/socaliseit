import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drainIncomingWebhooks } from '../incoming-webhook-worker';

const { inbox, process } = vi.hoisted(() => ({
    inbox: { findMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    process: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: { incomingWebhook: inbox } }));
vi.mock('@/lib/webhooks', () => ({ processWebhook: process }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

describe('incoming webhook inbox', () => {
    const payload = { entry: [] };
    const delivery = { id: 'delivery', type: 'instagram.message', payload, attempts: 0, runAt: new Date(0) };

    beforeEach(() => {
        vi.resetAllMocks();
        inbox.findMany.mockResolvedValue([delivery]);
        inbox.updateMany.mockResolvedValue({ count: 1 });
    });

    it('only processes a claimed delivery and clears its payload on success', async () => {
        await drainIncomingWebhooks();
        const lease = inbox.updateMany.mock.calls[0][0].data.runAt;
        expect(process).toHaveBeenCalledWith(delivery.type, payload);
        expect(inbox.updateMany).toHaveBeenLastCalledWith({
            where: { id: delivery.id, runAt: lease },
            data: { payload: expect.any(Object), runAt: null, expiresAt: expect.any(Date) },
        });
    });

    it('leaves a delivery alone if another worker claims it first', async () => {
        inbox.updateMany.mockResolvedValueOnce({ count: 0 });
        await drainIncomingWebhooks();
        expect(process).not.toHaveBeenCalled();
        expect(inbox.updateMany).toHaveBeenCalledTimes(1);
    });

    it('reschedules failures without losing the payload, and retains exhausted deliveries for inspection', async () => {
        process.mockRejectedValue(new Error('DB unavailable'));
        await drainIncomingWebhooks();
        expect(inbox.updateMany.mock.lastCall?.[0].data).toEqual({ attempts: 1, runAt: expect.any(Date), expiresAt: null });

        inbox.findMany.mockResolvedValue([{ ...delivery, attempts: 4 }]);
        await drainIncomingWebhooks();
        expect(inbox.updateMany.mock.lastCall?.[0].data).toEqual({ attempts: 5, runAt: null, expiresAt: expect.any(Date) });
    });
});
