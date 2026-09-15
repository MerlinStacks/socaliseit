// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scanWebsiteForSebBrandKnowledge } from '../ai/seb-advisor';
import { fetchExternalUrl } from '../fetch-external-url';
const mocks = vi.hoisted(() => ({ settings: vi.fn(), knowledge: vi.fn(), upsert: vi.fn() }));
vi.mock('../db', () => ({ db: {
    globalAISettings: { findUnique: mocks.settings },
    sebBrandKnowledge: { findUnique: mocks.knowledge, upsert: mocks.upsert },
} }));
vi.mock('../crypto', () => ({ decrypt: () => 'test-key' }));
vi.mock('../logger', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));
vi.mock('../ai/openrouter-models', () => ({ getSebModel: async () => ({ id: 'test/model', supportedParameters: [], reasoning: null }) }));
vi.mock('../platform-api/meta-ad-library', () => ({ fetchMetaAdLibraryInsights: vi.fn() }));
vi.mock('../services/token-service', () => ({ ensureValidToken: vi.fn() }));
vi.mock('../fetch-external-url', () => ({ fetchExternalUrl: vi.fn() }));

beforeEach(() => {
    vi.resetAllMocks();
    mocks.settings.mockResolvedValue({ isConfigured: true, sebEnabled: true });
    mocks.knowledge.mockResolvedValue(null);
    mocks.upsert.mockResolvedValue({});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }))));
});
afterEach(() => vi.unstubAllGlobals());

function page(url: string, html: string, type = 'text/html') {
    return { url, ok: true, headers: new Headers({ 'content-type': type }), text: async () => html } as never;
}
describe('Seb website protected reader integration', () => {
    it('uses pinned bounded reads for homepage and links relative to its final redirected URL', async () => {
        vi.mocked(fetchExternalUrl)
            .mockResolvedValueOnce(page('https://www.example.com/brand/', `<p>${'Brand information. '.repeat(20)}</p><a href="about">About</a>`))
            .mockResolvedValueOnce(page('https://www.example.com/brand/about', `<p>${'About the team. '.repeat(20)}</p>`));
        const result = await scanWebsiteForSebBrandKnowledge({ organizationId: 'org', websiteUrl: 'https://example.com' });
        expect(result.pages.map((p) => p.url)).toEqual(['https://www.example.com/brand/', 'https://www.example.com/brand/about']);
        expect(fetchExternalUrl).toHaveBeenNthCalledWith(2, 'https://www.example.com/brand/about', expect.objectContaining({ maxBytes: 500_000, timeoutMs: 8000 }));
        expect(fetchExternalUrl).toHaveBeenNthCalledWith(1, 'https://example.com/', expect.objectContaining({ maxBytes: 500_000, timeoutMs: 8000 }));
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith('https://openrouter.ai/api/v1/chat/completions', expect.any(Object));
    });
    it.each(['URL resolves to a nonpublic IP address', 'Response too large', 'External fetch timed out'])
        ('propagates homepage transport rejection: %s', async (reason) => {
            vi.mocked(fetchExternalUrl).mockRejectedValue(new Error(reason));
            await expect(scanWebsiteForSebBrandKnowledge({ organizationId: 'org', websiteUrl: 'https://example.com' })).rejects.toThrow(reason);
            expect(fetch).not.toHaveBeenCalled();
            expect(mocks.upsert).not.toHaveBeenCalled();
        });
    it('retains best-effort linked-page handling for a blocked redirect', async () => {
        vi.mocked(fetchExternalUrl)
            .mockResolvedValueOnce(page('https://example.com/', `<p>${'Brand information. '.repeat(20)}</p><a href="/about">About</a>`))
            .mockRejectedValueOnce(new Error('Nonpublic redirect'));
        expect((await scanWebsiteForSebBrandKnowledge({ organizationId: 'org', websiteUrl: 'https://example.com' })).pages).toHaveLength(1);
    });
    it('retains readable-content checks', async () => {
        vi.mocked(fetchExternalUrl).mockResolvedValue(page('https://example.com/', 'data', 'application/pdf'));
        await expect(scanWebsiteForSebBrandKnowledge({ organizationId: 'org', websiteUrl: 'https://example.com' })).rejects.toThrow('readable text or HTML');
    });
});
