// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { crawlListeningSources } from '../services/social-listening-crawler';
import { fetchExternalUrl } from '../fetch-external-url';
const mocks = vi.hoisted(() => ({
    source: { findMany: vi.fn(), update: vi.fn() },
    monitor: { findMany: vi.fn() }, brand: { findUnique: vi.fn() },
    item: { findMany: vi.fn(), upsert: vi.fn() },
}));
vi.mock('../db', () => ({ db: { socialListeningSource: mocks.source, socialListeningMonitor: mocks.monitor, sebBrandKnowledge: mocks.brand, socialListeningItem: mocks.item } }));
vi.mock('../logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock('../services/social-listening', () => ({ analyzeListeningSentiment: vi.fn() }));
vi.mock('../fetch-external-url', () => ({ fetchExternalUrl: vi.fn() }));

beforeEach(() => {
    vi.resetAllMocks();
    mocks.brand.findUnique.mockResolvedValue(null);
    mocks.monitor.findMany.mockResolvedValue([]);
    mocks.source.update.mockResolvedValue({});
});

afterEach(() => vi.useRealTimers());

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

interface StoredItem {
    organizationId: string;
    monitorId: string;
    sourceType: string;
    sourceId: string;
    externalUrl: string;
    occurredAt: Date;
    isRead: boolean;
    content: string;
}

describe('crawler identity and trust', () => {
    let items: StoredItem[];
    const source = { id: 'page', name: 'Page', url: 'https://example.com/news', sourceType: 'page', crawlDepth: 0 };

    beforeEach(() => {
        items = [];
        mocks.source.findMany.mockResolvedValue([source]);
        mocks.monitor.findMany.mockResolvedValue([{ id: 'monitor', keywords: ['news'], excludedTerms: [], platforms: [] }]);
        mocks.item.findMany.mockImplementation(async ({ where }) => items.filter(item =>
            item.organizationId === where.organizationId && item.monitorId === where.monitorId && item.sourceType === where.sourceType));
        mocks.item.upsert.mockImplementation(async ({ where, create, update }: {
            where: { monitorId_sourceType_sourceId: Pick<StoredItem, 'monitorId' | 'sourceType' | 'sourceId'> };
            create: StoredItem;
            update: Partial<StoredItem>;
        }) => {
            const key = where.monitorId_sourceType_sourceId;
            const existing = items.find(item => item.monitorId === key.monitorId && item.sourceType === key.sourceType && item.sourceId === key.sourceId);
            if (existing) {
                Object.assign(existing, update);
                return existing;
            }
            const item = { ...create, isRead: false };
            items.push(item);
            return item;
        });
        vi.mocked(fetchExternalUrl).mockResolvedValue(page(source.url, '<p>News first version</p>'));
    });

    it('preserves first seen and read status when an undated document is recrawled', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01'));
        expect((await crawlListeningSources('org')).errors).toEqual([]);
        items[0].isRead = true;
        vi.setSystemTime(new Date('2026-02-01'));
        vi.mocked(fetchExternalUrl).mockResolvedValue(page(source.url, '<p>News changed</p>'));
        expect((await crawlListeningSources('org')).errors).toEqual([]);
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ isRead: true, occurredAt: new Date('2026-01-01'), content: 'News changed' });
        expect(mocks.item.upsert.mock.calls[1][0].update).not.toHaveProperty('occurredAt');
        expect(mocks.item.upsert.mock.calls[1][0].update).not.toHaveProperty('isRead');
    });

    it('deduplicates canonical URLs across page, RSS and sitemap sources and repeated runs', async () => {
        mocks.source.findMany.mockResolvedValue([
            source,
            { ...source, id: 'feed', url: 'https://example.com/feed', sourceType: 'rss' },
            { ...source, id: 'sitemap', url: 'https://example.com/sitemap.xml', sourceType: 'sitemap' },
        ]);
        vi.mocked(fetchExternalUrl).mockImplementation(async (url) => {
            if (url === 'https://example.com/feed') return page(url, '<rss><item><link>https://example.com/news?a=1&amp;b=2&amp;fbclid=abc#rss</link><description>News feed</description></item></rss>');
            if (url === 'https://example.com/sitemap.xml') return page(url, '<urlset><url><loc>https://example.com/news?gclid=abc&amp;b=2&amp;a=1</loc></url></urlset>');
            return page('https://example.com/news?b=2&utm_source=site&a=1#page', '<p>News page</p>');
        });
        for (let run = 0; run < 2; run++) expect((await crawlListeningSources('org')).errors).toEqual([]);
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            externalUrl: 'https://example.com/news?a=1&b=2',
            sourceId: createHash('sha256').update('https://example.com/news?a=1&b=2').digest('hex'),
        });
    });

    it('keeps meaningful query differences and long URLs distinct', async () => {
        const prefix = `https://example.com/news?article=${'x'.repeat(1000)}`;
        for (const suffix of ['1', '2']) {
            vi.mocked(fetchExternalUrl).mockResolvedValue(page(`${prefix}${suffix}`, '<p>News</p>'));
            expect((await crawlListeningSources('org')).errors).toEqual([]);
        }
        expect(items).toHaveLength(2);
        expect(items[0].sourceId).not.toBe(items[1].sourceId);
        expect(items.every(item => /^[a-f0-9]{64}$/.test(item.sourceId))).toBe(true);
    });

    it('reuses cross-source legacy URLs while preserving their read status and date', async () => {
        const legacyUrl = 'https://example.com/news?utm_medium=email#old';
        items.push({ organizationId: 'org', monitorId: 'monitor', sourceType: 'crawler', sourceId: `old-feed:${legacyUrl}`, externalUrl: legacyUrl, occurredAt: new Date('2025-01-01'), isRead: true, content: 'Old news' });
        for (let run = 0; run < 2; run++) expect((await crawlListeningSources('org')).errors).toEqual([]);
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ sourceId: `old-feed:${legacyUrl}`, externalUrl: source.url, occurredAt: new Date('2025-01-01'), isRead: true, content: 'News first version' });
        expect(mocks.item.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org', monitorId: 'monitor', sourceType: 'crawler' } }));
    });

    it('uses real publication dates and preserves them when later feed dates are invalid', async () => {
        mocks.source.findMany.mockResolvedValue([{ ...source, sourceType: 'rss' }]);
        for (const date of ['2025-03-01', 'invalid']) {
            vi.mocked(fetchExternalUrl).mockResolvedValue(page(source.url, `<rss><item><link>${source.url}</link><description>News</description><pubDate>${date}</pubDate></item></rss>`));
            expect((await crawlListeningSources('org')).errors).toEqual([]);
        }
        expect(items).toHaveLength(1);
        expect(items[0].occurredAt).toEqual(new Date('2025-03-01'));
    });

    it('keeps URL identity scoped to each organization and monitor', async () => {
        items.push({ organizationId: 'other-org', monitorId: 'other-monitor', sourceType: 'crawler', sourceId: 'legacy', externalUrl: source.url, occurredAt: new Date('2025-01-01'), isRead: true, content: 'Other news' });
        mocks.monitor.findMany.mockResolvedValue(['first', 'second'].map(id => ({ id, keywords: ['news'], excludedTerms: [], platforms: [] })));
        expect((await crawlListeningSources('org')).errors).toEqual([]);
        expect(items).toHaveLength(3);
        expect(items[0]).toMatchObject({ organizationId: 'other-org', sourceId: 'legacy', isRead: true, content: 'Other news' });
        expect(items.slice(1).map(item => item.monitorId)).toEqual(['first', 'second']);
    });

    it.each([
        { platforms: [], expected: 1 },
        { platforms: ['MANUAL'], expected: 1 },
        { platforms: ['INSTAGRAM', 'MANUAL'], expected: 1 },
        { platforms: ['INSTAGRAM'], expected: 0 },
    ])('respects monitor platforms $platforms', async ({ platforms, expected }) => {
        mocks.monitor.findMany.mockResolvedValue([{ id: 'monitor', keywords: ['news'], excludedTerms: [], platforms }]);
        expect(await crawlListeningSources('org')).toMatchObject({ matched: expected, errors: [] });
        expect(items).toHaveLength(expected);
        if (expected) expect(mocks.item.upsert.mock.calls[0][0].create.platform).toBe('MANUAL');
        else expect(mocks.item.findMany).not.toHaveBeenCalled();
    });
});
