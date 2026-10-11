import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, metaJson, ensureValidToken } = vi.hoisted(() => ({
    db: { socialAccount: { findFirst: vi.fn() }, mention: { upsert: vi.fn() } },
    metaJson: vi.fn(),
    ensureValidToken: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../webhook-idempotency', () => ({ extractWebhookEventId: () => null, checkAndMarkWebhook: vi.fn() }));
vi.mock('../platform-api/meta-fetch', () => ({ metaJson }));
vi.mock('../services/token-service', () => ({ ensureValidToken }));
vi.mock('@/lib/services/inbox-notifications', () => ({ sendInboxNotifications: vi.fn() }));

import { processWebhook } from '../webhooks';

const payload = (values: Record<string, string>[]) => ({ object: 'instagram', entry: [{
    id: 'shop', changes: values.map(value => ({ field: 'mentions', value })),
}] });

describe('Instagram mention webhooks', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        db.socialAccount.findFirst.mockResolvedValue({ id: 'account', organizationId: 'org' });
        ensureValidToken.mockResolvedValue({ success: true, accessToken: 'decrypted-token' });
    });

    it('routes plural mentions and hydrates caption mentions via the media-ID field lookup', async () => {
        metaJson.mockResolvedValue({ mentioned_media: { id: '123', caption: 'Hello @shop', username: 'creator', timestamp: '2026-10-12T00:00:00Z' } });
        await processWebhook('instagram.mentions', payload([{ media_id: '123' }]));
        expect(new URL(metaJson.mock.calls[0][1]).searchParams.get('fields')).toBe('mentioned_media.media_id(123){id,caption,username,media_url,timestamp}');
        expect(metaJson.mock.calls[0][0]).toBe('decrypted-token');
        expect(db.mention.upsert).toHaveBeenCalledWith(expect.objectContaining({
            create: expect.objectContaining({ platformPostId: '123', text: 'Hello @shop', authorUsername: 'creator' }),
            update: expect.objectContaining({ text: 'Hello @shop' }),
        }));
    });

    it('keeps two comment mentions on one media distinct and fetches comment text', async () => {
        metaJson.mockResolvedValue({ mentioned_comment: { text: 'Hey @shop' } });
        await processWebhook('instagram.mentions', payload([{ media_id: '123', comment_id: '456' }, { media_id: '123', comment_id: '789' }]));
        expect(db.mention.upsert.mock.calls.map(([arg]) => arg.create.platformPostId)).toEqual(['456', '789']);
        expect(new URL(metaJson.mock.calls[0][1]).searchParams.get('fields')).toBe('mentioned_comment.comment_id(456){id,text,timestamp}');
        expect(db.mention.upsert.mock.calls[0][0].create).toMatchObject({ type: 'comment_mention', text: 'Hey @shop', authorUsername: 'unknown' });
    });

    it('preserves the event without overwriting existing details if lookup fails', async () => {
        metaJson.mockResolvedValue({ error: { message: 'Permission denied' } });
        await processWebhook('instagram.mentions', payload([{ media_id: '123' }]));
        expect(db.mention.upsert).toHaveBeenCalledWith(expect.objectContaining({
            create: expect.objectContaining({ platformPostId: '123', authorUsername: 'unknown' }), update: {},
        }));
    });
});
