// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { crawlListeningSources } from '../services/social-listening-crawler';
import { fetchExternalUrl } from '../fetch-external-url';
const mocks = vi.hoisted(() => ({
    source: { findMany: vi.fn(), update: vi.fn() },
    monitor: { findMany: vi.fn() }, brand: { findUnique: vi.fn() },
}));
vi.mock('../db', () => ({ db: { socialListeningSource: mocks.source, socialListeningMonitor: mocks.monitor, sebBrandKnowledge: mocks.brand } }));
vi.mock('../logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock('../services/social-listening', () => ({ analyzeListeningSentiment: vi.fn() }));
vi.mock('../fetch-external-url', () => ({ fetchExternalUrl: vi.fn() }));

beforeEach(() => {
    vi.resetAllMocks();
    mocks.brand.findUnique.mockResolvedValue(null);
    mocks.monitor.findMany.mockResolvedValue([]);
    mocks.source.update.mockResolvedValue({});
});

function page(url: string, text: string) {
    return { url, ok: true, headers: new Headers({ 'content-type': 'text/html' }), text: async () => text } as never;
}

describe('crawler transport integration', () => {
    it('uses bounded transport for sitemap-discovered URLs and tolerates blocked targets', async () => {
        mocks.source.findMany.mockResolvedValue([{ id: 's', name: 'Sitemap', url: 'https://example.com/sitemap.xml', sourceType: 'sitemap', crawlDepth: 0 }]);
        vi.mocked(fetchExternalUrl).mockResolvedValueOnce(page('https://example.com/sitemap.xml',
            '<urlset><url><loc>http://169.254.169.254/secret</loc></url><url><loc>https://example.com/news</loc></url></urlset>'))
            .mockRejectedValueOnce(new Error('Nonpublic IP addresses are not allowed'))
            .mockResolvedValueOnce(page('https://example.com/news', '<p>News</p>'));
        const result = await crawlListeningSources('org');
        expect(result.documents).toBe(1);
        expect(fetchExternalUrl).toHaveBeenCalledTimes(3);
        for (const [, options] of vi.mocked(fetchExternalUrl).mock.calls) {
            expect(options).toMatchObject({ maxBytes: 1_500_000, timeoutMs: 12000 });
        }
    });
    it('uses the final redirected URL as the base for discovered links', async () => {
        mocks.source.findMany.mockResolvedValue([{ id: 's', name: 'Page', url: 'https://example.com/start', sourceType: 'page', crawlDepth: 1 }]);
        vi.mocked(fetchExternalUrl).mockResolvedValueOnce(page('https://www.example.com/nested/', '<a href="next">Next</a>'))
            .mockResolvedValueOnce(page('https://www.example.com/nested/next', '<p>Next</p>'));
        expect((await crawlListeningSources('org')).documents).toBe(2);
        expect(fetchExternalUrl).toHaveBeenNthCalledWith(2, 'https://www.example.com/nested/next', expect.any(Object));
    });
    it('records initial SSRF rejection as a source failure', async () => {
        mocks.source.findMany.mockResolvedValue([{ id: 's', name: 'Blocked', url: 'https://example.com', sourceType: 'page', crawlDepth: 0 }]);
        vi.mocked(fetchExternalUrl).mockRejectedValue(new Error('URL resolves to a nonpublic IP address'));
        expect((await crawlListeningSources('org')).errors).toEqual(['Blocked: URL resolves to a nonpublic IP address']);
        expect(mocks.source.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lastError: 'URL resolves to a nonpublic IP address' }) }));
    });
});
