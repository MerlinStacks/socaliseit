import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db } = vi.hoisted(() => ({ db: {
    socialAccount: { findFirst: vi.fn() },
    directMessage: { findFirst: vi.fn(), upsert: vi.fn() },
} }));
vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../webhook-idempotency', () => ({ extractWebhookEventId: () => null, checkAndMarkWebhook: vi.fn() }));

import { processWebhook } from '../webhooks';

describe.each(['instagram.message', 'facebook.message'] as const)('%s routing', (type) => {
    beforeEach(() => {
        vi.resetAllMocks();
        db.socialAccount.findFirst.mockResolvedValue({ id: 'account', organizationId: 'org', platformId: 'shop' });
        db.directMessage.findFirst.mockResolvedValue({ conversationId: 'meta-thread' });
    });

    async function receive(outbound: boolean, echo = false, mid: string | undefined = 'message') {
        return processWebhook(type, { entry: [{ id: 'shop', messaging: [{
            sender: { id: outbound ? 'shop' : 'customer' },
            recipient: { id: outbound ? 'customer' : 'shop' },
            timestamp: 1792100000000,
            message: { mid, text: 'Auto reply', ...(echo ? { is_echo: true } : {}) },
        }] }] });
    }

    it.each([true, false])('routes native outbound replies to the customer thread (echo flag: %s)', async (echo) => {
        expect(await receive(true, echo)).toMatchObject({ success: true });
        expect(db.socialAccount.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ platformId: 'shop' }),
        }));
        expect(db.directMessage.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { organizationId: 'org', socialAccountId: 'account', direction: 'inbound', senderId: 'customer' },
        }));
        expect(db.directMessage.upsert).toHaveBeenCalledWith(expect.objectContaining({
            create: expect.objectContaining({ conversationId: 'meta-thread', direction: 'outbound', senderId: 'shop', isRead: true }),
        }));
    });

    it('keeps inbound customer messages unread on the same thread', async () => {
        await receive(false);
        expect(db.directMessage.upsert).toHaveBeenCalledWith(expect.objectContaining({
            create: expect.objectContaining({ conversationId: 'meta-thread', direction: 'inbound', senderId: 'customer', isRead: false }),
        }));
    });

    it('uses the same fallback thread for both directions before sync', async () => {
        db.directMessage.findFirst.mockResolvedValue(null);
        await receive(false);
        await receive(true, true);
        for (const [args] of db.directMessage.upsert.mock.calls) {
            expect(args.create.conversationId).toBe('customer:shop');
        }
    });

    it('ignores messages without an ID', async () => {
        await receive(true, true, '');
        expect(db.directMessage.upsert).not.toHaveBeenCalled();
    });

    it('does not save messages for an unknown connected account', async () => {
        db.socialAccount.findFirst.mockResolvedValue(null);
        await receive(true, true);
        expect(db.directMessage.upsert).not.toHaveBeenCalled();
    });
});
