// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeSebModel } from '../openrouter-models';
import { sebBudget, sebInputReserve } from '../seb-budget';

const model = (reasoning?: Record<string, unknown>, extra = {}) => normalizeSebModel({
    id: 'provider/model', architecture: { input_modalities: ['text', 'image'] },
    supported_parameters: ['temperature'], context_length: 128000,
    top_provider: { max_completion_tokens: 16000 }, reasoning, ...extra,
})!;
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('capability normalization and budgets', () => {
    it('normalizes modalities, parameters, reasoning and tightest advertised caps', () => {
        expect(model({ mandatory: true, default_enabled: true, supported_efforts: ['LOW'], supports_max_tokens: true }, {
            supported_parameters: ['structured_outputs', 'reasoning'], context_length: 10000,
            top_provider: { context_length: 9000, max_completion_tokens: 8000 }, per_request_limits: { completion_tokens: 7000 },
        })).toMatchObject({ inputModalities: ['text', 'image'], supportsImageInput: true, supportsStructuredOutputs: true,
            contextLength: 9000, maxCompletionTokens: 7000,
            reasoning: { mandatory: true, defaultEnabled: true, supportedEfforts: ['low'], supportsMaxTokens: true } });
        expect(model(undefined, { architecture: { modality: 'text->image', input_modalities: ['text'] } }).supportsImageInput).toBe(false);
    });
    it.each([200, 800, 1000])('reserves %i visible tokens for mandatory token-budget models', output => {
        expect(sebBudget(model({ mandatory: true, supports_max_tokens: true }), output, 1000)).toEqual({
            max_tokens: output + 1024, reasoning: { max_tokens: 1024, exclude: true },
        });
    });
    it.each([200, 800, 1000])('adds headroom for mandatory effort-only models at %i', output => {
        const result = sebBudget(model({ mandatory: true, supported_efforts: ['high', 'low'] }), output, 1000);
        expect(result).toEqual({ max_tokens: output + 2048, reasoning: { effort: 'low', exclude: true } });
    });
    it('uses minimal over low and never disables mandatory reasoning', () => {
        expect(sebBudget(model({ mandatory: true, supported_efforts: ['none', 'low', 'minimal'] }), 200, 0).reasoning?.effort).toBe('minimal');
    });
    it('disables default-on optional reasoning only when none is allowed', () => {
        expect(sebBudget(model({ mandatory: false, default_enabled: true, supported_efforts: ['none', 'low'] }), 200, 0)).toEqual({ max_tokens: 200, reasoning: { effort: 'none', exclude: true } });
        expect(sebBudget(model({ mandatory: false, default_enabled: true, supported_efforts: ['low'] }), 200, 0).max_tokens).toBe(2248);
    });
    it('distinguishes null allowlist, omitted efforts, and explicit defaults', () => {
        expect(sebBudget(model({ mandatory: false, supported_efforts: null }), 200, 0).reasoning?.effort).toBe('none');
        expect(sebBudget(model({ mandatory: true, supported_efforts: null }), 200, 0).reasoning?.effort).toBe('minimal');
        expect(sebBudget(model({ mandatory: false, default_enabled: false }), 200, 0)).toEqual({ max_tokens: 200 });
        expect(() => sebBudget(model({ mandatory: false, default_enabled: true }), 200, 0)).toThrow();
        expect(() => sebBudget(model({ supported_efforts: ['none'] }), 200, 0)).toThrow();
    });
    it('rejects mandatory high-only/unknown reasoning and dynamic routers', () => {
        for (const m of [model({ mandatory: true, supported_efforts: ['high'] }), model({ mandatory: true }),
            model(undefined, { supported_parameters: ['reasoning'] }), model(undefined, { id: 'openrouter/auto' })]) {
            expect(() => sebBudget(m, 200, 0)).toThrow();
        }
    });
    it('does not shrink visible output or exceed model output/context caps', () => {
        const m = model({ mandatory: true, supports_max_tokens: true });
        expect(() => sebBudget({ ...m, maxCompletionTokens: 1024 }, 200, 0)).toThrow();
        expect(() => sebBudget({ ...m, contextLength: 1500 }, 200, 500)).toThrow();
        expect(sebBudget({ ...m, maxCompletionTokens: 1224 }, 200, 0).max_tokens).toBe(1224);
        expect(sebBudget(model(), 200, 0)).toEqual({ max_tokens: 200 });
    });
    it('reserves image context without counting base64 as prompt text', () => {
        expect(sebInputReserve([{ content: [{ type: 'image_url', image_url: { url: 'x'.repeat(100000) } }] }])).toBe(4256);
    });
});

describe('public cached catalogue', () => {
    it('coalesces calls, expires after five minutes, and fails closed with outage backoff', async () => {
        vi.resetModules();
        vi.useFakeTimers();
        const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'vision', supported_parameters: [], architecture: { input_modalities: ['image'] } }, { id: 'text', supported_parameters: [] }] })));
        vi.stubGlobal('fetch', fetch);
        const { getSebModels, validateSebModel } = await import('../openrouter-models');
        const lists = await Promise.all([getSebModels(), getSebModels()]);
        expect(lists[0]).toBe(lists[1]);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect((fetch.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty('Authorization');
        await expect(validateSebModel('vision')).resolves.toMatchObject({ supportsImageInput: true });
        await expect(validateSebModel('text')).rejects.toMatchObject({ code: 'MODEL' });
        await expect(validateSebModel('missing')).rejects.toMatchObject({ code: 'MODEL' });
        vi.advanceTimersByTime(300001);
        fetch.mockRejectedValue(new Error('private-provider-error'));
        await expect(getSebModels()).rejects.toMatchObject({ code: 'METADATA' });
        await expect(getSebModels()).rejects.toMatchObject({ code: 'METADATA' });
        expect(fetch).toHaveBeenCalledTimes(2);
        vi.advanceTimersByTime(15001);
        fetch.mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'recovered', supported_parameters: [] }] })));
        expect((await getSebModels())[0].id).toBe('recovered');
    });
    it.each([new Response('{}'), new Response('{"data":[{"id":"unknown"}]}'), new Response('private-error', { status: 429 }), new Response('not json')])('rejects unusable metadata', async response => {
        vi.resetModules();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
        const { getSebModels } = await import('../openrouter-models');
        await expect(getSebModels()).rejects.toMatchObject({ code: 'METADATA' });
    });
});
