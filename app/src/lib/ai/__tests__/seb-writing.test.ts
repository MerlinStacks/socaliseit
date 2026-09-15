// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    organization: vi.fn(), voice: vi.fn(), knowledge: vi.fn(), posts: vi.fn(), settings: vi.fn(), decrypt: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: {
    organization: { findUnique: mocks.organization }, brandVoice: { findUnique: mocks.voice },
    sebBrandKnowledge: { findUnique: mocks.knowledge }, post: { findMany: mocks.posts },
    globalAISettings: { findUnique: mocks.settings },
} }));
vi.mock('@/lib/crypto', () => ({ decrypt: mocks.decrypt }));
vi.mock('../openrouter-models', () => ({ getSebModel: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
import { getSebModel } from '../openrouter-models';

import { formatSebWritingContext, loadSebWritingContext } from '../seb-writing-context';
import { generateSebCaption, generateSebReplies, generateSebTags, rewriteSebCaption } from '../seb-writing';

const fetchMock = vi.fn<typeof fetch>();
const respond = (content: unknown) => fetchMock.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] })));
const requestBody = () => JSON.parse(fetchMock.mock.calls.at(-1)![1]!.body as string);

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getSebModel).mockResolvedValue({ id: 'test/model', supportedParameters: ['temperature'], reasoning: null } as never);
    vi.stubGlobal('fetch', fetchMock);
    mocks.organization.mockImplementation(async ({ where }) => ({ id: where.id, name: `Business ${where.id}`, timezone: 'UTC', tier: 'FREE' }));
    mocks.voice.mockImplementation(async ({ where }) => ({ guidelines: `Tone ${where.organizationId}`, samples: ['Warm and practical'], toneProfile: { emojiStyle: 'none' } }));
    // Model Prisma selection, so an accidental broad query would expose pending data.
    mocks.knowledge.mockImplementation(async ({ where, select }) => {
        const row = { products: `Products ${where.organizationId}`, learnedInsights: { approved: 'Made locally' }, pendingInsights: 'UNAPPROVED', websiteScanSummary: 'UNREVIEWED' };
        return Object.fromEntries(Object.entries(row).filter(([key]) => !select || select[key]));
    });
    mocks.posts.mockResolvedValue([{ id: 'post', caption: 'Published example', platform: 'INSTAGRAM', publishedAt: new Date() }]);
    mocks.settings.mockResolvedValue({ isConfigured: true, apiKey: 'encrypted', sebEnabled: true, sebModel: 'seb/model', selectedModel: 'general/model', sebTemperature: 0.4 });
    mocks.decrypt.mockReturnValue('key');
    respond('Grounded caption #local');
});
afterEach(() => vi.unstubAllGlobals());

describe('shared Seb context', () => {
    it('isolates each organization and selects approved knowledge only', async () => {
        const a = await loadSebWritingContext('a');
        const b = await loadSebWritingContext('b');
        expect(a.organization.name).toBe('Business a');
        expect(b.brandVoice?.guidelines).toBe('Tone b');
        expect(JSON.stringify(a)).not.toMatch(/UNAPPROVED|UNREVIEWED|Business b|Tone b/);
        expect(a.sebBrandKnowledge?.learnedInsights).toEqual({ approved: 'Made locally' });
        for (const query of [mocks.voice, mocks.knowledge, mocks.posts]) {
            expect(query.mock.calls.map(([args]) => args.where.organizationId)).toEqual(['a', 'b']);
        }
        expect(mocks.knowledge.mock.calls[0][0].select).not.toHaveProperty('pendingInsights');
    });

    it('bounds recent published queries, captions, samples, and prompt context', async () => {
        mocks.posts.mockResolvedValue([{ id: 'post', caption: 'x'.repeat(5000), platform: 'INSTAGRAM', publishedAt: new Date() }]);
        mocks.voice.mockResolvedValue({ guidelines: 'g'.repeat(100000), toneProfile: null, samples: Array(100).fill('s'.repeat(10000)) });
        const context = await loadSebWritingContext('a');
        const query = mocks.posts.mock.calls[0][0];
        expect(query).toMatchObject({ take: 8, where: { organizationId: 'a', status: 'PUBLISHED', caption: { not: '' } }, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }] });
        expect(Math.abs(query.where.publishedAt.gte.getTime() - (Date.now() - 90 * 86400000))).toBeLessThan(1000);
        expect(context.recentPosts[0].caption).toHaveLength(1200);
        expect(formatSebWritingContext(context).length).toBeLessThanOrEqual(24000);
        expect(formatSebWritingContext(context)).toContain('Recent published posts:');
        expect(formatSebWritingContext(context)).toContain('x'.repeat(1200));
    });

    it('rejects missing identity rather than generating unscoped writing', async () => {
        await expect(loadSebWritingContext('')).rejects.toThrow('Organization');
        mocks.organization.mockResolvedValue(null);
        await expect(loadSebWritingContext('missing')).rejects.toThrow('Organization not found');
    });
});

describe('grounded writing prompts and provider', () => {
    it.each([true, false])('validates wrapper outputs with schema support %s and preserves array contracts', async supportsStructuredOutputs => {
        vi.mocked(getSebModel).mockResolvedValue({ id: 'test/model', supportedParameters: [], reasoning: null, supportsStructuredOutputs } as never);
        respond('{"items":["Thanks for asking!"]}');
        expect(await generateSebReplies('a', { messageText: 'Hi', messageType: 'dm', platform: 'instagram', tone: 'friendly', suggestionCount: 1 })).toEqual(['Thanks for asking!']);
        expect(requestBody().response_format?.type).toBe(supportsStructuredOutputs ? 'json_schema' : undefined);
        respond('{"items":["LOCAL", "craft"]}');
        expect(await generateSebTags('a', { title: 'Making things' })).toEqual(['local', 'craft']);
        respond('{"items":[123]}');
        await expect(generateSebTags('a', { title: 'Making things' })).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
    });
    it('uses Seb settings and shared brand context for captions', async () => {
        const result = await generateSebCaption('a', { prompt: 'Our new local product', platform: 'instagram', contentType: 'product', includeHashtags: true });
        expect(result).toEqual({ caption: 'Grounded caption #local', hashtags: ['#local'] });
        expect(requestBody()).toMatchObject({ model: 'seb/model', temperature: 0.4 });
        const system = requestBody().messages[0].content;
        for (const text of ['Business a', 'Tone a', 'Products a', 'Made locally', 'Published example', 'emojiStyle']) expect(system).toContain(text);
        expect(system).not.toContain('UNAPPROVED');
    });

    it('applies rewrite instructions and media metadata with the original caption', async () => {
        await rewriteSebCaption('b', { caption: 'Original', platform: 'bluesky', instruction: 'Make it shorter, no emojis', mediaContext: { hasVideo: true, hasImage: false, mediaCount: 1 } });
        expect(requestBody().messages[0].content).toContain('300 characters');
        expect(requestBody().messages[1].content).toContain('Make it shorter, no emojis');
        expect(requestBody().messages[1].content).toContain('Original');
        expect(requestBody().messages[1].content).toContain('"hasVideo":true');
    });

    it('grounds replies, applies requested tone, and bounds conversation history', async () => {
        respond('["Thanks for asking!"]');
        const suggestions = await generateSebReplies('a', {
            messageText: 'Where is this made?', messageType: 'review', platform: 'facebook', tone: 'empathetic', suggestionCount: 1, rating: 4,
            conversationHistory: Array.from({ length: 10 }, (_, i) => ({ direction: 'inbound', text: `message-${i}` })),
        });
        expect(suggestions).toEqual(['Thanks for asking!']);
        expect(requestBody().messages[0].content).toContain('Requested tone: empathetic');
        expect(requestBody().messages[0].content).toContain('Made locally');
        expect(JSON.parse(requestBody().messages[1].content).conversationHistory).toHaveLength(5);
    });

    it('grounds tags and deduplicates existing tags case-insensitively', async () => {
        respond('["LOCAL", "local", "Handmade", "craft"]');
        expect(await generateSebTags('a', { title: 'How we make it', existingTags: ['HANDMADE'] })).toEqual(['local', 'craft']);
        expect(requestBody().messages[0].content).toContain('Products a');
        expect(requestBody().messages[1].content).toContain('How we make it');
    });

    it('keeps the Seb model and temperature when chat is disabled', async () => {
        mocks.settings.mockResolvedValue({ isConfigured: true, apiKey: 'encrypted', sebEnabled: false, sebModel: 'seb/model', selectedModel: 'general/model', sebTemperature: 0.4 });
        await rewriteSebCaption('a', { caption: 'Original', platform: 'instagram' });
        expect(requestBody()).toMatchObject({ model: 'seb/model', temperature: 0.4 });
    });

    it.each(['', '[]', '{}', '[123]', '[""]', 'not json'])('rejects invalid structured replies: %s', async content => {
        respond(content);
        await expect(generateSebReplies('a', { messageText: 'Hi', messageType: 'dm', platform: 'instagram', tone: 'friendly', suggestionCount: 1 })).rejects.toThrow();
    });

    it('fails when unconfigured, on provider errors, and on decryption errors', async () => {
        const rewrite = () => rewriteSebCaption('a', { caption: 'Original', platform: 'instagram' });
        mocks.settings.mockResolvedValueOnce(null);
        await expect(rewrite()).rejects.toThrow('not configured');
        expect(fetchMock).not.toHaveBeenCalled();
        fetchMock.mockResolvedValueOnce(new Response('Failed', { status: 503 }));
        await expect(rewrite()).rejects.toMatchObject({ code: 'UNAVAILABLE', status: 503 });
        mocks.decrypt.mockImplementationOnce(() => { throw new Error('Decryption failed'); });
        await expect(rewrite()).rejects.toMatchObject({ code: 'CONFIGURATION' });
    });

    it.each([
        { error: { message: 'Provider failed' } },
        { choices: [{ message: { content: 'Partial' }, finish_reason: 'length' }] },
        { choices: [{ message: { content: ' ' }, finish_reason: 'stop' }] },
    ])('rejects unsuccessful HTTP-200 completions', async body => {
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body)));
        await expect(rewriteSebCaption('a', { caption: 'Original', platform: 'instagram' })).rejects.toThrow();
    });

    it.each(['[]', '{}', '[123]', 'not json'])('rejects invalid tag output: %s', async content => {
        respond(content);
        await expect(generateSebTags('a', { title: 'Video' })).rejects.toThrow();
    });
});
