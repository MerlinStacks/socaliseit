// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rewrite: vi.fn(), caption: vi.fn(), reply: vi.fn(), tags: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/ai/seb-writing', () => ({ rewriteSebCaption: mocks.rewrite, generateSebCaption: mocks.caption, generateSebReplies: mocks.reply, generateSebTags: mocks.tags }));
vi.mock('@/lib/logger', () => ({ createRouteLogger: () => ({ error: vi.fn() }) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })), EXPENSIVE_RATE_LIMIT: {}, createRateLimitHeaders: vi.fn() }));

import { POST as rewrite } from '@/app/api/ai/rewrite-caption/route';
import { POST as caption } from '@/app/api/ai/generate-caption/route';
import { POST as reply } from '@/app/api/ai/generate-reply/route';
import { POST as tags } from '@/app/api/ai/generate-tags/route';

const request = (body: unknown) => new NextRequest('http://localhost/api/ai/test', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'user', currentOrganizationId: 'active-tenant' } });
    mocks.rewrite.mockResolvedValue('Rewritten');
});

describe('writing routes', () => {
    it('rewrites using the active tenant and forwards an instruction of up to 500 characters', async () => {
        const body = { caption: 'Original', platform: 'instagram', instruction: 'x'.repeat(500) };
        const response = await rewrite(request(body));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, data: { caption: 'Rewritten' } });
        expect(mocks.rewrite).toHaveBeenCalledWith('active-tenant', body);
    });

    it.each([undefined, ''])('accepts optional instruction %j', async instruction => {
        expect((await rewrite(request({ caption: 'Original', platform: 'instagram', instruction }))).status).toBe(200);
    });

    it.each(['x'.repeat(501), 123, null])('rejects invalid rewrite instruction', async instruction => {
        expect((await rewrite(request({ caption: 'Original', platform: 'instagram', instruction }))).status).toBe(400);
        expect(mocks.rewrite).not.toHaveBeenCalled();
    });

    it('requires an active organization for rewrite and tags', async () => {
        mocks.auth.mockResolvedValue({ user: { id: 'user' } });
        expect((await rewrite(request({ caption: 'Original', platform: 'instagram' }))).status).toBe(401);
        expect((await tags(request({ title: 'Video' }))).status).toBe(401);
    });

    it('preserves caption, reply, and tag success contracts', async () => {
        mocks.caption.mockResolvedValueOnce({ caption: 'Caption', hashtags: ['#local'] });
        mocks.reply.mockResolvedValueOnce(['Reply']);
        mocks.tags.mockResolvedValueOnce(['local']);
        expect(await (await caption(request({ prompt: 'Our new product launch', platform: 'instagram', contentType: 'product' }))).json()).toEqual({
            success: true, data: { caption: 'Caption', hashtags: ['#local'], viralityScore: 0, brandVoiceScore: 0, suggestions: [], alternatives: [] },
        });
        expect(await (await reply(request({ messageText: 'Hi', messageType: 'dm', platform: 'instagram' }))).json()).toEqual({
            success: true, data: { suggestions: ['Reply'], metadata: { sentiment: 'neutral', tone: 'friendly', platform: 'instagram', generatedAt: expect.any(String) } },
        });
        expect(await (await tags(request({ title: 'Video' }))).json()).toEqual({ success: true, data: { tags: ['local'] } });
    });

    it.each([
        { handler: rewrite, mock: mocks.rewrite, body: { caption: 'Original', platform: 'instagram' } },
        { handler: caption, mock: mocks.caption, body: { prompt: 'Our new product launch', platform: 'instagram', contentType: 'product' } },
        { handler: reply, mock: mocks.reply, body: { messageText: 'Hi', messageType: 'dm', platform: 'instagram' } },
        { handler: tags, mock: mocks.tags, body: { title: 'Video' } },
    ])('returns an error rather than mock success for failed writing', async ({ handler, mock, body }) => {
        mock.mockRejectedValueOnce(new Error('AI unavailable'));
        const response = await handler(request(body));
        expect(response.status).toBe(500);
        expect(await response.json()).toMatchObject({ success: false, error: expect.any(String) });
        expect(mock.mock.calls.at(-1)?.[0]).toBe('active-tenant');
    });
});
