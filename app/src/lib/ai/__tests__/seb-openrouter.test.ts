// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/crypto', () => ({ decrypt: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/platform-api/meta-ad-library', () => ({ fetchMetaAdLibraryInsights: vi.fn() }));
vi.mock('@/lib/services/token-service', () => ({ ensureValidToken: vi.fn() }));
vi.mock('../openrouter-models', () => ({ getSebModel: vi.fn() }));
import { callOpenRouter } from '../seb-advisor';
import { getSebModel } from '../openrouter-models';
import { logger } from '@/lib/logger';
import { requestSebCompletion } from '../seb-transport';
import { WRITING_LIST_SCHEMA } from '../seb-output-schemas';
import { SebProviderError, sebErrorResponse } from '../seb-provider-error';

const settings = {
    apiKey: 'secret-key', model: 'test/model', temperature: 0.55,
    systemPrompt: 'private-system-prompt', maxVideoFrames: 20,
    maxReportsPerDay: 3, maxChatsPerDay: 30, maxVideosPerReport: 10,
};
const messages = [{ role: 'user', content: 'private-user-prompt' }];
const fetchMock = vi.fn<typeof fetch>();
const completion = (content: unknown, finishReason = 'stop') => ({ choices: [{ message: { content }, finish_reason: finishReason }] });
const respond = (body: unknown) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body)));
const requestBody = () => JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getSebModel).mockResolvedValue({ id: 'test/model', supportedParameters: ['temperature', 'response_format'], reasoning: null } as never);
    vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('shared Seb transport', () => {
    it('preserves chat whitespace and options and uses modern attribution', async () => {
        respond(completion('  answer  '));
        await expect(callOpenRouter(settings, messages, 1200, true)).resolves.toBe('  answer  ');
        expect(requestBody()).toEqual({ model: settings.model, messages, temperature: 0.55, max_tokens: 1200, response_format: { type: 'json_object' } });
        expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer secret-key', 'X-OpenRouter-Title': 'Overseek Socials Seb' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it.each(['', ' \n ', null, undefined])('does not rebill empty content %j', async content => {
        respond(completion(content, 'length'));
        await expect(callOpenRouter(settings, messages)).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it('retains partial nonempty chat JSON for existing normalization', async () => {
        respond(completion('{"partial":', 'length'));
        await expect(callOpenRouter(settings, messages)).resolves.toBe('{"partial":');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it.each([[401, 'CONFIGURATION', 503], [402, 'CREDITS', 503], [403, 'BLOCKED', 403], [429, 'RATE_LIMIT', 429], [408, 'TIMEOUT', 504], [504, 'TIMEOUT', 504], [400, 'REQUEST', 400], [502, 'UNAVAILABLE', 503]])(
        'maps HTTP %i to safe %s', async (status, code, routeStatus) => {
            fetchMock.mockResolvedValueOnce(new Response('private-provider-body secret-key', { status: Number(status), headers: { 'Retry-After': '60' } }));
            let error: unknown;
            try { await callOpenRouter(settings, messages); } catch (caught) { error = caught; }
            expect(error).toMatchObject({ code, status: routeStatus });
            const response = sebErrorResponse(error)!;
            expect(response.status).toBe(routeStatus);
            expect(await response.text()).not.toMatch(/private-|secret-key/);
            expect(JSON.stringify(error)).not.toMatch(/private-|secret-key/);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });
    it('honors embedded typed errors even when their numeric code is generic', async () => {
        respond({ error: { code: 500, message: 'private-provider-error', metadata: { error_type: 'rate_limit_exceeded' } } });
        await expect(callOpenRouter(settings, messages)).rejects.toMatchObject({ code: 'RATE_LIMIT', status: 429 });
    });
    it.each([
        { error: { code: 503, message: 'private-provider-error' } },
        { choices: [{ error: { code: 502 }, message: { content: 'partial' } }] },
        completion('', 'error'),
    ])('rejects embedded failures without retry', async body => {
        respond(body);
        await expect(callOpenRouter(settings, messages)).rejects.toBeInstanceOf(SebProviderError);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it.each(['content_filter', 'refusal'])('handles %s safely', async reason => {
        respond(completion('private-refusal', reason));
        await expect(callOpenRouter(settings, messages)).rejects.toMatchObject({ code: 'BLOCKED' });
    });
    it.each(['TimeoutError', 'AbortError', 'Error'])('sanitizes %s without retries', async name => {
        fetchMock.mockRejectedValueOnce(Object.assign(new Error('private-network-details'), { name }));
        await expect(callOpenRouter(settings, messages)).rejects.toMatchObject({ code: name === 'Error' ? 'UNAVAILABLE' : 'TIMEOUT' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it('logs only allowlisted generation/usage/cost, never content or raw usage', async () => {
        respond({ ...completion('answer'), id: 'gen-abc123', usage: { prompt_tokens: 10, completion_tokens: 210, total_tokens: 220, cost: 0.005,
            completion_tokens_details: { reasoning_tokens: 200, raw: 'private-reasoning' }, raw: messages }, raw: 'private-payload' });
        await callOpenRouter(settings, messages);
        expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ generationId: 'gen-abc123', promptTokens: 10, reasoningTokens: 200, cost: 0.005 }), expect.any(String));
        expect(JSON.stringify([vi.mocked(logger.info).mock.calls, vi.mocked(logger.warn).mock.calls])).not.toMatch(/private-|secret-key/);
    });
    it('drops unexpected diagnostic values', async () => {
        respond({ ...completion('ok', 'private-finish'), id: 'private-id', usage: { cost: 'private-cost', prompt_tokens: -5 } });
        await callOpenRouter(settings, messages);
        expect(JSON.stringify(vi.mocked(logger.info).mock.calls)).not.toMatch(/private-|secret-key|-5/);
    });
    it('rejects invalid JSON safely', async () => {
        fetchMock.mockResolvedValueOnce(new Response('private-not-json'));
        await expect(callOpenRouter(settings, messages)).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
    });
    it('classifies timeouts while reading a successful response body', async () => {
        const response = new Response();
        vi.spyOn(response, 'json').mockRejectedValue(new DOMException('private-read-error', 'TimeoutError'));
        fetchMock.mockResolvedValueOnce(response);
        await expect(callOpenRouter(settings, messages)).rejects.toMatchObject({ code: 'TIMEOUT' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it('requires reasoning-capable endpoints and reserves headroom in the actual request', async () => {
        vi.mocked(getSebModel).mockResolvedValue({ id: 'test/model', supportedParameters: ['reasoning'], supportsImageInput: true,
            reasoning: { mandatory: true, supportsMaxTokens: true } } as never);
        respond(completion('A mug.'));
        await requestSebCompletion(settings, [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'private-image' } }] }], 200);
        expect(requestBody()).toMatchObject({ max_tokens: 1224, reasoning: { max_tokens: 1024, exclude: true }, provider: { require_parameters: true } });
        expect(requestBody()).not.toHaveProperty('temperature');
    });
    it('validates runtime images before sending payloads', async () => {
        await expect(requestSebCompletion(settings, [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'private-image' } }] }], 200)).rejects.toMatchObject({ code: 'MODEL' });
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('fails closed on metadata outages without generation', async () => {
        vi.mocked(getSebModel).mockRejectedValue(new SebProviderError('METADATA'));
        await expect(callOpenRouter(settings, messages)).rejects.toMatchObject({ code: 'METADATA' });
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it.each([true, false])('uses schema support %s with object root and prompt fallback', async supports => {
        vi.mocked(getSebModel).mockResolvedValue({ id: 'test/model', supportedParameters: [], supportsStructuredOutputs: supports, reasoning: null } as never);
        respond(completion('{"items":["reply"]}'));
        await requestSebCompletion(settings, messages, 1000, WRITING_LIST_SCHEMA);
        expect(requestBody().messages.at(-1).content).toContain('"items"');
        if (supports) {
            expect(requestBody().response_format).toEqual({ type: 'json_schema', json_schema: { ...WRITING_LIST_SCHEMA, strict: true } });
            expect(requestBody().provider).toEqual({ require_parameters: true });
        } else expect(requestBody()).not.toHaveProperty('response_format');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
