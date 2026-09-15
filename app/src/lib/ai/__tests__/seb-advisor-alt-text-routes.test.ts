// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(), rate: vi.fn(), settings: vi.fn(), decrypt: vi.fn(), organization: vi.fn(),
    voice: vi.fn(), knowledge: vi.fn(), posts: vi.fn(), media: vi.fn(), update: vi.fn(), read: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/crypto', () => ({ decrypt: mocks.decrypt }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() }, createRouteLogger: () => ({ error: vi.fn(), warn: vi.fn() }) }));
vi.mock('../openrouter-models', () => ({ getSebModel: vi.fn() }));
import { getSebModel } from '../openrouter-models';
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.rate, EXPENSIVE_RATE_LIMIT: {}, createRateLimitHeaders: () => ({ 'Retry-After': '60' }) }));
vi.mock('fs/promises', () => ({ readFile: mocks.read }));
vi.mock('@/lib/db', () => ({ db: {
    globalAISettings: { findUnique: mocks.settings }, organization: { findUnique: mocks.organization },
    brandVoice: { findUnique: mocks.voice }, sebBrandKnowledge: { findUnique: mocks.knowledge },
    post: { findMany: mocks.posts }, media: { findFirst: mocks.media, update: mocks.update },
} }));

import { POST as advisor } from '@/app/api/ai/analytics-advisor/route';
import { POST as altText } from '@/app/api/ai/generate-alt-text/route';

const metrics = {
    totalLikes: 100, totalComments: 10, totalShares: 5, totalSaves: 3, totalReach: 500, totalImpressions: 600,
    likesChange: 10, commentsChange: 0, sharesChange: 0, reachChange: 0, impressionsChange: 0, savesChange: 0,
    avgEngagementRate: 2, totalFollowers: 1000, totalFollowerChange: 20, accounts: [], contentTypes: [],
    totalPosts: 5, postsChange: 0, rangeLabel: 'Last 30 days',
};
const summary = { headline: 'Engagement grew', summary: 'Likes reached **100**.', bullets: ['Likes grew 10%.'], recommendations: ['Test more product posts.'] };
const image = { imageUrl: 'https://cdn.example.com/image.png', context: 'Promote our invisible brand', organizationId: 'other' };
const request = (body: unknown) => new NextRequest('http://localhost/api/ai/test', { method: 'POST', body: JSON.stringify(body) });
const fetchMock = vi.fn<typeof fetch>();
const respond = (content: unknown, extra = {}) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop', ...extra }] })));
const sent = () => JSON.parse(fetchMock.mock.calls.at(-1)![1]!.body as string);

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getSebModel).mockResolvedValue({ id: 'test/model', supportedParameters: ['temperature', 'structured_outputs'], supportsStructuredOutputs: true, supportsImageInput: true, reasoning: null } as never);
    vi.stubGlobal('fetch', fetchMock);
    mocks.auth.mockResolvedValue({ user: { id: 'user', currentOrganizationId: 'active' } });
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.settings.mockResolvedValue({ isConfigured: true, apiKey: 'encrypted', sebEnabled: true, sebModel: 'seb/vision', selectedModel: 'general/model', sebTemperature: 0.45 });
    mocks.decrypt.mockReturnValue('key');
    mocks.organization.mockImplementation(async ({ where }) => ({ id: where.id, name: `Business ${where.id}` }));
    mocks.voice.mockResolvedValue({ guidelines: 'Warm tone' });
    mocks.knowledge.mockResolvedValue({ products: 'Blue mugs', learnedInsights: 'Approved knowledge' });
    mocks.posts.mockResolvedValue([{ caption: 'Recent published caption' }]);
    mocks.media.mockResolvedValue({ url: '/uploads/mug.png' });
    mocks.read.mockResolvedValue(Buffer.from('image bytes'));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Seb analytics and alt-text integration', () => {
    it.each([true, false])('preserves advisor JSON contract with schema support %s', async supportsStructuredOutputs => {
        vi.mocked(getSebModel).mockResolvedValue({ id: 'test/model', supportedParameters: [], reasoning: null, supportsStructuredOutputs } as never);
        respond(JSON.stringify(summary));
        expect(await (await advisor(request(metrics))).json()).toEqual({ success: true, data: summary, fallback: false });
        expect(sent().response_format?.type).toBe(supportsStructuredOutputs ? 'json_schema' : undefined);
        respond('{"headline":"missing fields"}');
        expect((await advisor(request(metrics))).status).toBe(502);
    });
    it('rejects a stored nonvision model before sending or persisting alt text', async () => {
        vi.mocked(getSebModel).mockResolvedValue({ supportsImageInput: false } as never);
        const response = await altText(request({ mediaId: 'media' }));
        expect(response.status).toBe(400);
        expect((await response.json()).error).toContain('image input');
        expect(fetchMock).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });
    it('preserves advisor contract, fenced JSON, settings, and active business context', async () => {
        respond('```json\n' + JSON.stringify(summary) + '\n```');
        const response = await advisor(request({ ...metrics, organizationId: 'other' }));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, data: summary, fallback: false });
        expect(sent()).toMatchObject({ model: 'seb/vision', temperature: 0.45, max_tokens: 800 });
        expect(sent().messages[1].content).toContain('Likes: 100');
        for (const text of ['Business active', 'Warm tone', 'Blue mugs', 'Approved knowledge', 'Recent published caption']) {
            expect(sent().messages[1].content).toContain(text);
        }
        expect(mocks.organization).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'active' } }));
        for (const query of [mocks.voice, mocks.knowledge, mocks.posts]) {
            expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: 'active' }) }));
        }
        expect(mocks.rate).toHaveBeenCalledWith('user:ai-advisor', expect.anything());
    });

    it('uses the same settings/context and real remote multimodal input with accessibility precedence', async () => {
        respond('"A blue mug on a wooden table."');
        const response = await altText(request(image));
        expect(await response.json()).toEqual({ success: true, data: { altText: 'A blue mug on a wooden table.' } });
        expect(sent()).toMatchObject({ model: 'seb/vision', temperature: 0.45, max_tokens: 200 });
        expect(sent().messages[1].content[0]).toEqual({ type: 'image_url', image_url: { url: image.imageUrl } });
        expect(sent().messages[1].content[1].text).toContain('Business active');
        expect(sent().messages[1].content[1].text).toContain('Approved knowledge');
        expect(sent().messages[0].content).toContain('never invent');
        expect(sent().messages[0].content).toContain('never override objective accessibility');
        expect(mocks.rate).toHaveBeenCalledWith('user:ai-alt-text', expect.anything());
    });

    it('embeds local vision input and scopes media lookup/save to active tenant', async () => {
        respond('A'.repeat(130));
        const response = await altText(request({ mediaId: 'media', ...image }));
        const expected = 'A'.repeat(122) + '...';
        expect(await response.json()).toEqual({ success: true, data: { altText: expected } });
        expect(sent().messages[1].content[0].image_url.url).toBe(`data:image/png;base64,${Buffer.from('image bytes').toString('base64')}`);
        expect(mocks.media).toHaveBeenCalledWith({ where: { id: 'media', organizationId: 'active' } });
        expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'media', organizationId: 'active' }, data: { altText: expected } });
    });

    it('keeps a valid description when optional persistence fails', async () => {
        respond('A mug.');
        mocks.update.mockRejectedValueOnce(new Error('Database unavailable'));
        expect((await altText(request({ mediaId: 'media' }))).status).toBe(200);
    });

    it('embeds absolute own-origin uploads and keeps external upload URLs remote', async () => {
        vi.stubEnv('NEXTAUTH_URL', 'https://app.example.com');
        respond('A mug.');
        expect((await altText(request({ imageUrl: 'https://app.example.com/uploads/mug.png' }))).status).toBe(200);
        expect(sent().messages[1].content[0].image_url.url).toMatch(/^data:image\/png;base64,/);
        respond('A mug.');
        expect((await altText(request({ imageUrl: 'https://external.example.com/uploads/mug.png' }))).status).toBe(200);
        expect(sent().messages[1].content[0].image_url.url).toBe('https://external.example.com/uploads/mug.png');
        expect(mocks.read).toHaveBeenCalledTimes(1);
    });

    it('reloads context for the active tenant when switching organizations', async () => {
        respond('A mug.');
        await altText(request(image));
        expect(sent().messages[1].content[1].text).toContain('Business active');
        mocks.auth.mockResolvedValueOnce({ user: { id: 'user', currentOrganizationId: 'switched' } });
        respond('A mug.');
        await altText(request(image));
        expect(sent().messages[1].content[1].text).toContain('Business switched');
        expect(sent().messages[1].content[1].text).not.toContain('Business active');
        for (const query of [mocks.voice, mocks.knowledge, mocks.posts]) {
            expect(query.mock.calls.map(([args]) => args.where.organizationId)).toEqual(['active', 'switched']);
        }
    });

    it('does not access another tenant media or generate without an available image', async () => {
        mocks.media.mockResolvedValueOnce(null);
        expect((await altText(request({ mediaId: 'other' }))).status).toBe(404);
        mocks.read.mockRejectedValueOnce(new Error('Missing image'));
        expect((await altText(request({ mediaId: 'media' }))).status).toBe(500);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it('rejects local traversal without reading files', async () => {
        expect((await altText(request({ imageUrl: '/uploads/%2e%2e/private.png' }))).status).toBe(500);
        expect(mocks.read).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    for (const [name, handler, body, content] of [
        ['advisor', advisor, metrics, JSON.stringify(summary)], ['alt-text', altText, image, 'A mug.'],
    ] as const) {
        describe(name, () => {
            it.each([[401, 503], [402, 503], [429, 429], [504, 504]])('returns safe route status for provider HTTP %i', async (providerStatus, routeStatus) => {
                fetchMock.mockResolvedValueOnce(new Response('private-provider-error', { status: providerStatus, headers: { 'Retry-After': '30' } }));
                const response = await handler(request(body));
                expect(response.status).toBe(routeStatus);
                expect(await response.text()).not.toContain('private-provider-error');
                if (providerStatus === 429) expect(response.headers.get('Retry-After')).toBe('30');
                expect(fetchMock).toHaveBeenCalledTimes(1);
            });
            it('keeps the Seb model when chat is disabled', async () => {
                mocks.settings.mockResolvedValueOnce({ isConfigured: true, apiKey: 'encrypted', sebEnabled: false, sebModel: 'disabled/model', selectedModel: 'general/vision' });
                respond(content);
                expect((await handler(request(body))).status).toBe(200);
                expect(sent()).toMatchObject({ model: 'disabled/model', temperature: 0.55 });
            });
            it('enforces authentication, organization, and rate limits before generation', async () => {
                mocks.auth.mockResolvedValueOnce(null).mockResolvedValueOnce({ user: { id: 'user' } });
                expect((await handler(request(body))).status).toBe(401);
                expect((await handler(request(body))).status).toBe(401);
                mocks.rate.mockResolvedValueOnce({ allowed: false });
                const response = await handler(request(body));
                expect(response.status).toBe(429);
                expect(response.headers.get('Retry-After')).toBe('60');
                expect(fetchMock).not.toHaveBeenCalled();
                expect(mocks.organization).not.toHaveBeenCalled();
            });
            it('rejects invalid request bodies', async () => {
                expect((await handler(request({}))).status).toBe(400);
                expect((await handler(new NextRequest('http://localhost', { method: 'POST', body: '{' }))).status).toBe(400);
                expect(fetchMock).not.toHaveBeenCalled();
            });
            it.each(['unconfigured', 'decrypt', 'http', 'network', 'empty', 'malformed', 'invalid-json', 'filtered', 'refused', 'truncated', 'embedded'])('reports %s failures honestly', async failure => {
                if (failure === 'unconfigured') mocks.settings.mockResolvedValueOnce(null);
                if (failure === 'decrypt') mocks.decrypt.mockImplementationOnce(() => { throw new Error('Bad key'); });
                if (failure === 'http') fetchMock.mockResolvedValueOnce(new Response('Vision unsupported', { status: 404 }));
                if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('Offline'));
                if (failure === 'empty') respond('');
                if (failure === 'malformed') respond({ invalid: true });
                if (failure === 'invalid-json') fetchMock.mockResolvedValueOnce(new Response('not json'));
                if (failure === 'filtered') respond(content, { finish_reason: 'content_filter' });
                if (failure === 'refused') respond(content, { message: { content, refusal: 'No' } });
                if (failure === 'truncated') respond(content, { finish_reason: 'length' });
                if (failure === 'embedded') respond(content, { error: { message: 'Provider failed' } });
                const response = await handler(request(body));
                const status = ['unconfigured', 'decrypt', 'network', 'embedded'].includes(failure) ? 503
                    : failure === 'http' ? 400 : ['filtered', 'refused'].includes(failure) ? 403 : 502;
                expect(response.status).toBe(status);
                expect(await response.json()).toEqual({ success: false, error: expect.any(String), code: expect.any(String) });
                expect(mocks.update).not.toHaveBeenCalled();
            });
        });
    }

    it.each(['null', 'not JSON', JSON.stringify({ ...summary, bullets: [123] }), JSON.stringify({ ...summary, recommendations: [] })])('rejects malformed advisor output %s', async content => {
        respond(content);
        expect((await advisor(request(metrics))).status).toBe(502);
    });
    it.each(['""', '{}', '[]', '```text\nA mug\n```', 'Alt text: A mug'])('rejects malformed alt text %s', async content => {
        respond(content);
        expect((await altText(request({ mediaId: 'media' }))).status).toBe(502);
        expect(mocks.update).not.toHaveBeenCalled();
    });
});
