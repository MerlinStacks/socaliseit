import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { getCredentialsForPlatform } from '@/lib/platforms/credentials';
const { store } = vi.hoisted(() => ({ store: vi.fn<(args: {
    data: Array<{ id: string; type: string; payload: Record<string, unknown> }>;
    skipDuplicates: boolean;
}) => Promise<unknown>>() }));
vi.mock('@/lib/db', () => ({ db: { incomingWebhook: { createMany: store } } }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/platforms/credentials', () => ({ getCredentialsForPlatform: vi.fn().mockResolvedValue({ clientSecret: 'test-secret' }) }));

const signature = (body: Uint8Array) => `sha256=${crypto.createHmac('sha256', 'test-secret').update(body).digest('hex')}`;
const send = (body: Uint8Array, digest: string, platform = 'facebook') => POST(new NextRequest(`https://example.com/api/webhooks/${platform}`, {
    method: 'POST', body: body as BodyInit, headers: { 'x-hub-signature-256': digest },
}), { params: Promise.resolve({ platform }) });

describe('Meta webhook verification and routing', () => {
    beforeEach(() => store.mockReset());

    it('routes verified Instagram events delivered to the Facebook callback', async () => {
        const body = Buffer.from(JSON.stringify({ object: 'instagram', entry: [{ messaging: [{ message: { text: 'Hello 👋' } }] }] }));
        expect((await send(body, signature(body))).status).toBe(200);
        expect(store).toHaveBeenCalledWith({ data: [{ id: expect.any(String), type: 'instagram.message', payload: expect.any(Object) }], skipDuplicates: true });
    });

    it('routes verified Page events delivered to the Instagram callback', async () => {
        const body = Buffer.from(JSON.stringify({ object: 'page', entry: [{ changes: [{ field: 'feed' }] }] }));
        expect((await send(body, signature(body), 'instagram')).status).toBe(200);
        expect(store).toHaveBeenCalledWith({ data: [{ id: expect.any(String), type: 'facebook.feed', payload: expect.any(Object) }], skipDuplicates: true });
    });

    it('stores each type from mixed entries and keeps matching changes grouped', async () => {
        const comment = { field: 'comments', value: { id: 'comment' } };
        const mention = { field: 'mentions', value: { id: 'mention' } };
        const messaging = [{ message: { mid: 'dm' } }];
        const body = Buffer.from(JSON.stringify({ object: 'instagram', entry: [null,
            { id: 'first', changes: [comment, mention], messaging },
            { id: 'second', changes: [comment] },
        ] }));
        expect((await send(body, signature(body))).status).toBe(200);
        expect((await send(body, signature(body), 'instagram')).status).toBe(200);
        const [{ data }] = store.mock.calls[0];
        expect(data.map(({ type, payload }) => [type, payload.entry])).toEqual([
            ['instagram.message', [{ id: 'first', messaging }]],
            ['instagram.comments', [{ id: 'first', changes: [comment] }, { id: 'second', changes: [comment] }]],
            ['instagram.mentions', [{ id: 'first', changes: [mention] }]],
        ]);
        expect(new Set(data.map(({ id }) => id)).size).toBe(3);
        expect(store.mock.calls[1][0].data).toEqual(data);
    });

    it('does not acknowledge a delivery until the insert completes, and returns 503 if it fails', async () => {
        const body = Buffer.from('{"object":"page"}');
        let rejectInsert!: (reason: Error) => void;
        store.mockImplementationOnce(() => new Promise((_, reject) => { rejectInsert = reject; }));
        let acknowledged = false;
        const response = send(body, signature(body)).then(value => { acknowledged = true; return value; });
        await vi.waitFor(() => expect(rejectInsert).toBeTypeOf('function'));
        expect(acknowledged).toBe(false);
        rejectInsert(new Error('Database offline'));
        expect((await response).status).toBe(503);
    });

    it('assigns the same ID to an identical delivery and a different ID to a changed payload', async () => {
        const body = Buffer.from('{"object":"page","entry":[{"id":"page","time":1}]}');
        const changed = Buffer.from('{"object":"page","entry":[{"id":"page","time":1,"changes":[]}]}');
        await send(body, signature(body));
        await send(body, signature(body));
        await send(changed, signature(changed));
        const keys = store.mock.calls.map(([options]) => options.data[0].id);
        expect(keys[0]).toMatch(/^[a-f0-9]{64}$/);
        expect(keys[1]).toBe(keys[0]);
        expect(keys[2]).not.toBe(keys[0]);
    });

    it('verifies the exact bytes, not a re-encoded UTF-8 string', async () => {
        const body = Buffer.concat([Buffer.from('{"text":"'), Buffer.from([0xff]), Buffer.from('"}')]);
        expect((await send(body, signature(body))).status).toBe(200);
    });

    it('returns a retryable error if credential lookup is unavailable', async () => {
        vi.mocked(getCredentialsForPlatform).mockRejectedValueOnce(new Error('Database offline'));
        const body = Buffer.from('{"object":"page"}');
        expect((await send(body, signature(body))).status).toBe(503);
        expect(store).not.toHaveBeenCalled();
    });

    it.each(['sha256=' + 'é'.repeat(64), 'sha256=bad', 'sha256=' + '0'.repeat(64)])('rejects malformed or mismatched signatures: %s', async digest => {
        const body = Buffer.from('{"object":"page"}');
        expect((await send(body, digest)).status).toBe(401);
        expect(store).not.toHaveBeenCalled();
    });
});
