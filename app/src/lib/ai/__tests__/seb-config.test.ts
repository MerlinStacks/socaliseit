// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ settings: vi.fn(), decrypt: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { globalAISettings: { findUnique: mocks.settings } } }));
vi.mock('@/lib/crypto', () => ({ decrypt: mocks.decrypt }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));
vi.mock('../openrouter-models', () => ({ getSebModel: async () => ({ id: 'test/model', supportedParameters: ['temperature'], reasoning: null }) }));
vi.mock('@/lib/platform-api/meta-ad-library', () => ({ fetchMetaAdLibraryInsights: vi.fn() }));
vi.mock('@/lib/services/token-service', () => ({ ensureValidToken: vi.fn() }));

import { DEFAULT_SEB_MODEL, getSebProviderSettings } from '../seb-config';
import { getSebSettings } from '../seb-advisor';
import { completeSebWriting } from '../seb-writing-completion';

const configured = {
    isConfigured: true, apiKey: 'encrypted', sebEnabled: true,
    sebModel: 'seb/model', selectedModel: 'legacy/model', sebTemperature: 0.35,
};
const fetchMock = vi.fn();
beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings.mockResolvedValue({ ...configured });
    mocks.decrypt.mockReturnValue('secret');
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Written' } }] })));
    vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('shared Seb provider settings', () => {
    it('resolves the same credentials, model and temperature for chat and writing', async () => {
        const provider = await getSebProviderSettings();
        expect(await getSebSettings()).toMatchObject({ apiKey: provider.apiKey, model: provider.model, temperature: provider.temperature });
        await completeSebWriting([{ role: 'user', content: 'Write' }]);
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ model: provider.model, temperature: provider.temperature });
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer secret');
    });

    it('disabling chat gates chat/reports only and leaves writing unchanged', async () => {
        await completeSebWriting([{ role: 'user', content: 'Write' }]);
        mocks.settings.mockResolvedValue({ ...configured, sebEnabled: false });
        await expect(getSebSettings()).rejects.toThrow('Seb is disabled');
        await completeSebWriting([{ role: 'user', content: 'Write' }]);
        expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
    });

    it.each([null, '', '  '])('uses the explicit default, never legacy selectedModel, for unset model %j', async sebModel => {
        mocks.settings.mockResolvedValue({ ...configured, sebModel });
        expect((await getSebSettings()).model).toBe(DEFAULT_SEB_MODEL);
        await completeSebWriting([{ role: 'user', content: 'Write' }]);
        expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe(DEFAULT_SEB_MODEL);
    });

    it.each([null, { ...configured, isConfigured: false }])('requires provider availability for both consumers', async settings => {
        mocks.settings.mockResolvedValue(settings);
        await expect(getSebSettings()).rejects.toThrow('OpenRouter is not configured');
        await expect(completeSebWriting([])).rejects.toThrow('OpenRouter is not configured');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects empty decrypted credentials', async () => {
        mocks.decrypt.mockReturnValue('  ');
        await expect(getSebProviderSettings()).rejects.toThrow('OpenRouter is not configured');
    });
});
