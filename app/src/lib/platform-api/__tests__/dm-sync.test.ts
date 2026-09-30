import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    account: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), token: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: {
    socialAccount: { findUnique: mocks.account },
    directMessage: { findMany: mocks.findMany, upsert: mocks.upsert },
} }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/services/token-service', () => ({ ensureValidToken: mocks.token, handle401Error: vi.fn() }));

import { syncFacebookDMs, syncInstagramDMs } from '../dm-sync';

describe.each([
    ['FACEBOOK', syncFacebookDMs], ['INSTAGRAM', syncInstagramDMs],
] as const)('%s sender names', (platform, sync) => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.account.mockResolvedValue({ id: 'account', organizationId: 'org', platform, platformId: 'page' });
        mocks.token.mockResolvedValue({ success: true, accessToken: 'token' });
        mocks.findMany.mockResolvedValueOnce([{ platformMessageId: 'message' }]).mockResolvedValueOnce([]);
        mocks.upsert.mockResolvedValue({ id: 'local' });
    });
    afterEach(() => vi.unstubAllGlobals());

    it.each([
        [{ id: 'sender', name: 'Sam Smith' }, [], 'Sam Smith'],
        [{ id: 'sender', username: 'sam' }, [], 'sam'],
        [{ id: 'sender' }, [{ id: 'sender', name: 'Sam Smith' }], 'Sam Smith'],
        [{ id: 'sender' }, [{ id: 'other', name: 'Other Person' }], undefined],
    ])('hydrates webhook placeholders without erasing known names: %j', async (from, participants, expected) => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{
            id: 'conversation', participants: { data: participants }, messages: { data: [{
                id: 'message', from, message: 'Hello', created_time: '2026-09-28T10:00:00Z',
            }] },
        }] }) }));

        expect(await sync('account')).toMatchObject({ success: true, added: 0, updated: 1 });
        const { create, update } = mocks.upsert.mock.calls[0][0];
        expect(create.senderUsername).toBe(expected || 'sender');
        if (expected) expect(update.senderUsername).toBe(expected);
        else expect(update).not.toHaveProperty('senderUsername');
    });
});
