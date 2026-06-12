import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { analyzeListeningSentiment } from '@/lib/services/social-listening';
import type { SocialListeningMonitor, SocialListeningSource } from '@/generated/prisma/client';

const USER_AGENT = 'SocialiseIT-ListeningCrawler/1.0 (+https://socialiseit.local)';
const MAX_RESPONSE_BYTES = 1_500_000;
const MAX_PAGES_PER_SOURCE = 15;
const PRIVATE_HOST_PATTERNS = [/^localhost$/i, /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[0-1])\./, /^::1$/];

export interface CreateCrawlerSourceInput {
    name: string;
    url: string;
    sourceType?: string;
    crawlDepth?: number;
}

interface CrawledDocument {
    url: string;
    title?: string;
    content: string;
    publishedAt?: Date;
}

export async function createCrawlerSource(organizationId: string, input: CreateCrawlerSourceInput) {
    const url = normalizeCrawlUrl(input.url);
    return db.socialListeningSource.create({
        data: {
            organizationId,
            name: input.name.trim() || new URL(url).hostname,
            url,
            sourceType: input.sourceType || 'auto',
            crawlDepth: Math.max(0, Math.min(1, input.crawlDepth || 0)),
        },
    });
}

export async function crawlListeningSources(organizationId: string) {
    await ensureAutomaticCrawlerSources(organizationId);

    const [sources, monitors] = await Promise.all([
        db.socialListeningSource.findMany({ where: { organizationId, isActive: true } }),
        db.socialListeningMonitor.findMany({ where: { organizationId, isActive: true } }),
    ]);

    let documents = 0;
    let matched = 0;
    const errors: string[] = [];

    for (const source of sources) {
        try {
            const crawled = await crawlSource(source);
            documents += crawled.length;
            matched += await ingestDocuments(organizationId, source, monitors, crawled);
            await db.socialListeningSource.update({
                where: { id: source.id },
                data: { lastCrawledAt: new Date(), lastError: null },
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown crawl error';
            errors.push(`${source.name}: ${message}`);
            logger.warn({ error, sourceId: source.id }, 'Social listening crawl source failed');
            await db.socialListeningSource.update({
                where: { id: source.id },
                data: { lastCrawledAt: new Date(), lastError: message },
            }).catch(() => undefined);
        }
    }

    logger.info({ organizationId, sources: sources.length, documents, matched, errors: errors.length }, 'Crawler sync complete');
    return { sources: sources.length, documents, matched, errors };
}

export async function ensureAutomaticCrawlerSources(organizationId: string) {
    const brandKnowledge = await db.sebBrandKnowledge.findUnique({
        where: { organizationId },
        select: { websiteUrl: true },
    });

    if (!brandKnowledge?.websiteUrl) return { created: 0 };

    const baseUrl = normalizeCrawlUrl(brandKnowledge.websiteUrl);
    const origin = new URL(baseUrl).origin;
    const candidates = [
        { name: 'Website', url: baseUrl, sourceType: 'page', crawlDepth: 1 },
        { name: 'Website sitemap', url: `${origin}/sitemap.xml`, sourceType: 'sitemap', crawlDepth: 0 },
        { name: 'Website feed', url: `${origin}/feed`, sourceType: 'rss', crawlDepth: 0 },
        { name: 'Website RSS', url: `${origin}/rss.xml`, sourceType: 'rss', crawlDepth: 0 },
    ];

    let created = 0;
    for (const candidate of candidates) {
        const existing = await db.socialListeningSource.findFirst({
            where: { organizationId, url: candidate.url },
            select: { id: true },
        });

        if (existing) continue;

        await db.socialListeningSource.create({
            data: {
                organizationId,
                name: candidate.name,
                url: candidate.url,
                sourceType: candidate.sourceType,
                crawlDepth: candidate.crawlDepth,
            },
        });
        created++;
    }

    return { created };
}

async function crawlSource(source: SocialListeningSource): Promise<CrawledDocument[]> {
    const url = normalizeCrawlUrl(source.url);
    const initial = await fetchText(url);
    const type = detectSourceType(source.sourceType, url, initial.contentType, initial.text);

    if (type === 'rss') return parseRss(initial.text, url).slice(0, MAX_PAGES_PER_SOURCE);
    if (type === 'sitemap') {
        const links = parseSitemap(initial.text, url).slice(0, MAX_PAGES_PER_SOURCE);
        return crawlPages(links);
    }

    const page = htmlToDocument(url, initial.text);
    if (source.crawlDepth < 1) return [page];

    const links = extractSameHostLinks(url, initial.text).slice(0, MAX_PAGES_PER_SOURCE - 1);
    const linkedPages = await crawlPages(links);
    return [page, ...linkedPages];
}

async function ingestDocuments(
    organizationId: string,
    source: SocialListeningSource,
    monitors: SocialListeningMonitor[],
    documents: CrawledDocument[]
) {
    let matched = 0;

    for (const monitor of monitors) {
        const keywords = normalizeTerms(monitor.keywords);
        const excludedTerms = normalizeTerms(monitor.excludedTerms);

        for (const doc of documents) {
            const matchedKeywords = matchTerms(`${doc.title || ''} ${doc.content}`, keywords, excludedTerms);
            if (matchedKeywords.length === 0) continue;

            await db.socialListeningItem.upsert({
                where: {
                    monitorId_sourceType_sourceId: {
                        monitorId: monitor.id,
                        sourceType: 'crawler',
                        sourceId: stableSourceId(source.id, doc.url),
                    },
                },
                update: {
                    externalUrl: doc.url,
                    authorName: source.name,
                    content: truncateContent(doc.content),
                    sentiment: analyzeListeningSentiment(doc.content),
                    matchedKeywords,
                    occurredAt: doc.publishedAt || new Date(),
                },
                create: {
                    organizationId,
                    monitorId: monitor.id,
                    platform: 'MANUAL',
                    sourceType: 'crawler',
                    sourceId: stableSourceId(source.id, doc.url),
                    externalUrl: doc.url,
                    authorName: source.name,
                    content: truncateContent(doc.content),
                    sentiment: analyzeListeningSentiment(doc.content),
                    matchedKeywords,
                    occurredAt: doc.publishedAt || new Date(),
                },
            });
            matched++;
        }
    }

    return matched;
}

function normalizeCrawlUrl(value: string): string {
    const candidate = value.trim();
    const url = new URL(candidate.startsWith('http') ? candidate : `https://${candidate}`);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS sources are supported');
    if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))) throw new Error('Private network URLs are not allowed');
    url.hash = '';
    return url.toString();
}

async function fetchText(url: string): Promise<{ text: string; contentType: string }> {
    const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml, text/html;q=0.9,*/*;q=0.5' },
        signal: AbortSignal.timeout(12000),
        redirect: 'follow',
    });
    if (!response.ok) throw new Error(`Fetch failed with ${response.status}`);

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_RESPONSE_BYTES) throw new Error('Response too large');

    const text = await response.text();
    return { text: text.slice(0, MAX_RESPONSE_BYTES), contentType: response.headers.get('content-type') || '' };
}

function detectSourceType(sourceType: string, url: string, contentType: string, text: string): 'rss' | 'sitemap' | 'page' {
    if (sourceType === 'rss' || sourceType === 'sitemap' || sourceType === 'page') return sourceType;
    if (/rss|atom|xml/i.test(contentType) && /<item|<entry/i.test(text)) return 'rss';
    if (/sitemap/i.test(url) || /<urlset|<sitemapindex/i.test(text)) return 'sitemap';
    return 'page';
}

function parseRss(xml: string, baseUrl: string): CrawledDocument[] {
    const blocks = xml.split(/<item\b[^>]*>|<entry\b[^>]*>/i).slice(1);
    return blocks.map((block) => ({
        url: resolveUrl(extractTag(block, 'link') || extractHref(block) || baseUrl, baseUrl),
        title: decodeEntities(stripTags(extractTag(block, 'title') || '')),
        content: decodeEntities(stripTags(extractTag(block, 'description') || extractTag(block, 'summary') || extractTag(block, 'content:encoded') || '')),
        publishedAt: parseDate(extractTag(block, 'pubDate') || extractTag(block, 'updated') || extractTag(block, 'published')),
    })).filter((doc) => doc.content || doc.title);
}

function parseSitemap(xml: string, baseUrl: string): string[] {
    return extractAllTags(xml, 'loc').map((link) => resolveUrl(link, baseUrl)).filter(Boolean);
}

async function crawlPages(urls: string[]): Promise<CrawledDocument[]> {
    const docs: CrawledDocument[] = [];
    for (const url of urls) {
        try {
            const response = await fetchText(url);
            docs.push(htmlToDocument(url, response.text));
        } catch {
            // Best-effort crawl; one broken page should not fail the source.
        }
    }
    return docs;
}

function htmlToDocument(url: string, html: string): CrawledDocument {
    const title = decodeEntities(stripTags(extractTag(html, 'title') || ''));
    const content = decodeEntities(stripTags(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' '))).replace(/\s+/g, ' ').trim();
    return { url, title, content };
}

function extractSameHostLinks(baseUrl: string, html: string): string[] {
    const base = new URL(baseUrl);
    const links = new Set<string>();
    const re = /href=["']([^"'#]+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html)) !== null) {
        try {
            const url = new URL(match[1], baseUrl);
            if (url.hostname === base.hostname && ['http:', 'https:'].includes(url.protocol)) {
                url.hash = '';
                links.add(url.toString());
            }
        } catch {
            // Ignore malformed links.
        }
    }
    return [...links];
}

function normalizeTerms(terms: string[]): string[] {
    return [...new Set(terms.map((term) => term.trim().toLowerCase()).filter(Boolean))];
}

function matchTerms(content: string, keywords: string[], excludedTerms: string[]): string[] {
    const lower = content.toLowerCase();
    if (excludedTerms.some((term) => lower.includes(term))) return [];
    return keywords.filter((keyword) => lower.includes(keyword));
}

function extractTag(text: string, tag: string): string | undefined {
    const match = text.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return match?.[1]?.trim();
}

function extractAllTags(text: string, tag: string): string[] {
    const values: string[] = [];
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) values.push(decodeEntities(stripTags(match[1])).trim());
    return values;
}

function extractHref(text: string): string | undefined {
    return text.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1];
}

function stripTags(value: string): string {
    return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ');
}

function decodeEntities(value: string): string {
    return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function parseDate(value?: string): Date | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

function resolveUrl(value: string, baseUrl: string): string {
    return new URL(decodeEntities(value).trim(), baseUrl).toString();
}

function stableSourceId(sourceId: string, url: string): string {
    return `${sourceId}:${url}`.slice(0, 900);
}

function truncateContent(content: string): string {
    return content.replace(/\s+/g, ' ').trim().slice(0, 8000);
}
