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
import { handle401Error } from '@/lib/services/token-service';

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

    it('retries oversized requests with smaller limits and follows conversation pages', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(Response.json({ error: { code: 1, message: "Please reduce the amount of data you're asking for, then retry your request" } }, { status: 400 }))
            .mockResolvedValueOnce(Response.json({ data: [], paging: { next: 'https://graph.facebook.com/v25.0/page/conversations?after=cursor&access_token=token' } }))
            .mockResolvedValueOnce(Response.json({ data: [] }));
        vi.stubGlobal('fetch', fetchMock);
        expect(await sync('account')).toMatchObject({ success: true });
        expect(fetchMock).toHaveBeenCalledTimes(3);
        const retryUrl = new URL(fetchMock.mock.calls[1][0]);
        expect(retryUrl.searchParams.get('limit')).toBe('1');
        expect(retryUrl.searchParams.get('fields')).toContain('messages.limit(1)');
        expect(fetchMock.mock.calls[2][0]).not.toContain('access_token');
        expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer token');
    });

    it('follows bounded message pages instead of dropping older messages', async () => {
        const message = (id: string) => ({ id, from: { id: 'page' }, message: id, created_time: '2026-10-15T10:00:00Z' });
        mocks.findMany.mockReset().mockResolvedValue([]);
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(Response.json({ data: [{ id: 'thread', messages: {
                data: [message('first')], paging: { next: 'https://graph.facebook.com/v25.0/thread/messages?after=cursor' },
            } }] }))
            .mockResolvedValueOnce(Response.json({ data: [message('second')] }));
        vi.stubGlobal('fetch', fetchMock);
        expect(await sync('account')).toMatchObject({ success: true, added: 2 });
        expect(mocks.upsert).toHaveBeenCalledTimes(2);
    });

    it('keeps permission failures out of the oversized-request retry path', async () => {
        const fetchMock = vi.fn().mockResolvedValue(Response.json({ error: { code: 10, message: 'Permission denied' } }, { status: 400 }));
        vi.stubGlobal('fetch', fetchMock);
        expect(await sync('account')).toMatchObject({ success: platform === 'INSTAGRAM' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('still refreshes expired tokens reported on a later page', async () => {
        vi.mocked(handle401Error).mockResolvedValue({ needsReconnect: true } as never);
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(Response.json({ data: [], paging: { next: 'https://graph.facebook.com/v25.0/page/conversations?after=cursor' } }))
            .mockResolvedValueOnce(Response.json({ error: { code: 190, message: 'Token expired' } }, { status: 401 }));
        vi.stubGlobal('fetch', fetchMock);
        expect(await sync('account')).toMatchObject({ success: false });
        expect(handle401Error).toHaveBeenCalledWith('account', 'Token expired');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not forward tokens to an unexpected pagination host', async () => {
        const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [], paging: { next: 'https://example.com/conversations' } }));
        vi.stubGlobal('fetch', fetchMock);
        expect(await sync('account')).toMatchObject({ success: false, error: 'Unexpected DM pagination origin' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('reconciles existing inbound and auto-reply rows onto the canonical Meta thread', async () => {
        mocks.findMany.mockReset();
        mocks.findMany.mockResolvedValueOnce([
            { platformMessageId: 'inbound' }, { platformMessageId: 'auto-reply' },
        ]).mockResolvedValueOnce([]);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{
            id: 'canonical-thread', messages: { data: [
                { id: 'inbound', from: { id: 'customer' }, message: 'Hello', created_time: '2026-10-15T10:00:00Z' },
                { id: 'auto-reply', from: { id: 'page' }, message: 'Our FAQ', created_time: '2026-10-15T10:00:01Z' },
            ] },
        }] }) }));

        expect(await sync('account')).toMatchObject({ success: true, added: 0, updated: 2 });
        expect(mocks.upsert.mock.calls[0][0].update).toMatchObject({ conversationId: 'canonical-thread', direction: 'inbound' });
        expect(mocks.upsert.mock.calls[0][0].update).not.toHaveProperty('isRead');
        expect(mocks.upsert.mock.calls[1][0].update).toMatchObject({ conversationId: 'canonical-thread', direction: 'outbound', isRead: true });
    });

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
