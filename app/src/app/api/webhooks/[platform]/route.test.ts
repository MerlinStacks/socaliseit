import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { processWebhook } from '@/lib/webhooks';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/platforms/credentials', () => ({ getCredentialsForPlatform: vi.fn().mockResolvedValue({ clientSecret: 'test-secret' }) }));
vi.mock('@/lib/webhooks', () => ({ processWebhook: vi.fn().mockResolvedValue(undefined) }));

const signature = (body: Uint8Array) => `sha256=${crypto.createHmac('sha256', 'test-secret').update(body).digest('hex')}`;
const send = (body: Uint8Array, digest: string, platform = 'facebook') => POST(new NextRequest(`https://example.com/api/webhooks/${platform}`, {
    method: 'POST', body: body as BodyInit, headers: { 'x-hub-signature-256': digest },
}), { params: Promise.resolve({ platform }) });

describe('Meta webhook verification and routing', () => {
    beforeEach(() => vi.clearAllMocks());

    it('routes verified Instagram events delivered to the Facebook callback', async () => {
        const body = Buffer.from(JSON.stringify({ object: 'instagram', entry: [{ messaging: [{ message: { text: 'Hello 👋' } }] }] }));
        expect((await send(body, signature(body))).status).toBe(200);
        expect(processWebhook).toHaveBeenCalledWith('instagram.message', expect.any(Object));
    });

    it('routes verified Page events delivered to the Instagram callback', async () => {
        const body = Buffer.from(JSON.stringify({ object: 'page', entry: [{ changes: [{ field: 'feed' }] }] }));
        expect((await send(body, signature(body), 'instagram')).status).toBe(200);
        expect(processWebhook).toHaveBeenCalledWith('facebook.feed', expect.any(Object));
    });

    it('verifies the exact bytes, not a re-encoded UTF-8 string', async () => {
        const body = Buffer.concat([Buffer.from('{"text":"'), Buffer.from([0xff]), Buffer.from('"}')]);
        expect((await send(body, signature(body))).status).toBe(200);
    });

    it.each(['sha256=' + 'é'.repeat(64), 'sha256=bad', 'sha256=' + '0'.repeat(64)])('rejects malformed or mismatched signatures: %s', async digest => {
        const body = Buffer.from('{"object":"page"}');
        expect((await send(body, digest)).status).toBe(401);
        expect(processWebhook).not.toHaveBeenCalled();
    });
});
