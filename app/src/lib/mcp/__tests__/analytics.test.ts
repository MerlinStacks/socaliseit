// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    key: vi.fn(), member: vi.fn(), rate: vi.fn(), post: vi.fn(), postMax: vi.fn(), accountMax: vi.fn(),
    summary: vi.fn(), growth: vi.fn(), top: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: {
    publishingApiKey: { findUnique: mocks.key }, organizationMember: { findUnique: mocks.member },
    post: { findFirst: mocks.post }, activity: { create: vi.fn() },
    postAnalytics: { aggregate: mocks.postMax }, platformAnalytics: { aggregate: mocks.accountMax },
} }));
// Keep the real pure helpers so MCP reports the app's own math, and stub only the database queries.
vi.mock('@/app/(dashboard)/analytics/analytics-data', async importOriginal => ({
    ...await importOriginal<typeof import('@/app/(dashboard)/analytics/analytics-data')>(),
    fetchAnalyticsData: mocks.summary, fetchAccountGrowth: mocks.growth,
}));
vi.mock('@/app/(dashboard)/analytics/analytics-data-video', () => ({ fetchTopPerformingPosts: mocks.top }));
vi.mock('@/lib/posts-service', () => ({ createPosts: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.rate }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { analyticsInput, analyticsSummary, accountGrowth, topPosts, getPostAnalytics } from '../analytics';
import { authenticatePublishingKey, generatePublishingKey, type PublishingPrincipal } from '../auth';
import { POST as mcp } from '@/app/api/mcp/route';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const principal: PublishingPrincipal = { keyId: 'key1', organizationId: 'org1', userId: 'user1',
    canCreateDraft: false, canEditPost: false, canSchedulePost: false,
    userName: 'Analyst', canRead: true, canReadMedia: true, canPublish: false, canUpload: false, canReadAnalytics: true };
const bearer = () => ({ Authorization: `Bearer ${generatePublishingKey().key}` });

/** Decoys the dashboard fetches but MCP must never expose: competitors, thumbnails, raw JSON blobs. */
const summaryFixture = () => ({
    socialAccounts: [{ id: 'acc1', platform: 'INSTAGRAM', name: 'Main', username: 'main' }],
    totalPosts: 12, publishedPosts: 9, scheduledPosts: 2, recentPublished: [], postsInPeriod: 10,
    previousPeriodPosts: 5, competitors: [{ name: 'SecretRival', followers: 999 }],
    myEngagementStats: { followers: 100 }, platformMetrics: { audience: 'SecretAudience' },
    engagementMetrics: { _sum: { likes: 100, comments: 10, shares: 5, saves: 4, reach: 1_000,
        impressions: 2_000, clicks: 20, videoViews: 300 }, _avg: { engagementRate: 4 } },
    previousEngagement: { _sum: { likes: 50, comments: 5, shares: 5, saves: 4, reach: 500,
        impressions: 1_000, clicks: 10, videoViews: 150 } },
    dateRange: { start: new Date('2026-09-30'), end: new Date('2026-10-30'), prevStart: new Date('2026-08-31') },
    platformEnum: undefined, hasData: true, isEmpty: false,
});

async function connect(scopes: string[], member: unknown = { organizationId: 'org1', role: 'OWNER', user: {} }) {
    mocks.key.mockResolvedValue({ id: 'key1', organizationId: 'org1', userId: 'user1', scopes,
        expiresAt: new Date(Date.now() + 60_000) });
    mocks.member.mockResolvedValue(member);
    const client = new Client({ name: 'analytics-test', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL('http://localhost/api/mcp'), {
        requestInit: { headers: bearer() }, fetch: async (url, init) => mcp(new Request(url, init)),
    });
    await client.connect(transport);
    return client;
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.postMax.mockResolvedValue({ _max: { syncedAt: new Date('2026-10-29') } });
    mocks.accountMax.mockResolvedValue({ _max: { syncedAt: new Date('2026-10-30') } });
    mocks.summary.mockResolvedValue(summaryFixture());
    mocks.growth.mockResolvedValue({ totalFollowers: 120, totalFollowerChange: 20, totalProfileViews: 30,
        totalWebsiteClicks: 7, accounts: Array.from({ length: 51 }, (_, index) => ({ id: `acc${index}`,
            name: `Account ${index}`, platform: 'instagram', currentFollowers: 100 - index,
            followerChange: index % 2, timeline: [{ date: 'Oct 1', followers: 1 }] })) });
    mocks.top.mockResolvedValue([{ id: 'post1', caption: 'x'.repeat(400), thumbnail: '/api/uploads/secret.png',
        platform: 'instagram', publishedAt: new Date('2026-10-01'), engagementRate: 7.5,
        likes: 30, comments: 4, shares: 2, videoViews: 80 }]);
    mocks.post.mockResolvedValue({ id: 'post1', status: 'PUBLISHED', platformPostId: 'p-1',
        publishedAt: new Date('2026-10-01'), platform: 'INSTAGRAM',
        socialAccount: { name: 'Main', platform: 'INSTAGRAM' }, errors: [{ errorCode: 'RATE_LIMIT' }],
        analytics: { impressions: 500, reach: 250, likes: 30, comments: 4, shares: 2, saves: 1, clicks: 6,
            videoViews: 80, videoWatchTime: 900, avgWatchPercentage: 42, engagementRate: 7.5,
            syncedAt: new Date('2026-10-02'), platformMetrics: { secret: 'raw' }, id: 'analytics1', postId: 'post1' } });
});

describe('analytics summary tool', () => {
    it('reports the dashboard totals, changes, and freshness for the key workspace', async () => {
        const result = await analyticsSummary(principal.organizationId, { range: '30d' });
        expect(mocks.summary).toHaveBeenCalledWith({ organizationId: 'org1', platformFilter: undefined, range: '30d' });
        expect(result).toMatchObject({ range: '30d', platform: 'all', hasData: true,
            posts: { created: 10, published: 9, scheduled: 2, createdChangePercent: 100 },
            engagement: { likes: 100, comments: 10, impressions: 2_000, engagementRatePercent: expect.any(Number),
                changePercent: { likes: 100, comments: 100, impressions: 100, shares: 0 } },
            postMetricsSyncedAt: new Date('2026-10-29'), accountMetricsSyncedAt: new Date('2026-10-30') });
        expect(JSON.stringify(result)).toContain('daily API metrics only');
    });
    it('never exposes competitors, raw platform JSON, or other workspaces', async () => {
        const serialized = JSON.stringify(await analyticsSummary(principal.organizationId, { range: '7d', platform: 'instagram' }));
        expect(serialized).not.toContain('SecretRival');
        expect(serialized).not.toContain('SecretAudience');
        expect(serialized).not.toContain('platformMetrics');
        expect(mocks.postMax).toHaveBeenCalledWith(expect.objectContaining({ where: { post: { organizationId: 'org1' } } }));
        expect(mocks.accountMax).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org1' } }));
    });
    it('rejects unknown ranges and tenant overrides instead of defaulting silently', () => {
        expect(analyticsInput.safeParse({ range: 'all' }).success).toBe(false);
        expect(analyticsInput.safeParse({ range: '30d', platform: 'mastodon' }).success).toBe(false);
        expect(analyticsInput.safeParse({ range: '30d', organizationId: 'org2' }).success).toBe(false);
        expect(analyticsInput.parse({}).range).toBe('30d');
    });
});

describe('growth, top posts, and per-post analytics', () => {
    it('summarises follower growth without large daily series', async () => {
        const result = await accountGrowth(principal.organizationId, { range: '90d', platform: 'instagram' });
        expect(mocks.growth).toHaveBeenCalledWith('org1', 'instagram', '90d');
        expect(result.totals).toEqual({ followers: 120, followerChange: 20, profileViews: 30, websiteClicks: 7 });
        expect(result.accounts).toHaveLength(50);
        expect(result.truncated).toBe(true);
        expect(JSON.stringify(result)).not.toContain('timeline');
    });
    it('returns engagement-ranked posts without media URLs', async () => {
        const result = await topPosts(principal.organizationId, {});
        expect(mocks.top).toHaveBeenCalledWith('org1', undefined, '30d');
        expect(result.posts[0]).toMatchObject({ postId: 'post1', engagementRatePercent: 7.5, likes: 30 });
        expect(result.posts[0].caption).toHaveLength(280);
        expect(JSON.stringify(result)).not.toContain('secret.png');
    });
    it('returns stored post metrics with publishing context, never the raw JSON blob', async () => {
        const result = await getPostAnalytics(principal.organizationId, { postId: 'post1' });
        expect(mocks.post).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'post1', organizationId: 'org1' } }));
        expect(result).toMatchObject({ platform: 'instagram', socialAccount: { name: 'Main', platform: 'instagram' },
            metrics: { likes: 30, videoWatchTimeSeconds: 900,
                averageWatchPercent: 42, engagementRatePercent: 7.5 } });
        expect(JSON.stringify(result)).not.toContain('raw');
    });
    it('distinguishes "no metrics yet" from a missing or foreign post', async () => {
        mocks.post.mockResolvedValueOnce({ id: 'post2', status: 'SCHEDULED', platformPostId: null,
            publishedAt: null, platform: null, socialAccount: null, errors: [], analytics: null });
        const empty = await getPostAnalytics(principal.organizationId, { postId: 'post2' });
        expect(empty).toMatchObject({ metrics: null, publishing: expect.any(Object) });
        expect(JSON.stringify(empty)).toContain('not synced');
        mocks.post.mockResolvedValueOnce(null);
        expect(await getPostAnalytics(principal.organizationId, { postId: 'foreign' })).toMatchObject({ error: 'Post not found', status: 404 });
    });
});

describe('analytics permission gating', () => {
    it.each([
        [['read'], { organizationId: 'org1', role: 'OWNER', user: {} }, true],
        // A read key whose issuer lost analytics.view keeps other reads but loses metrics.
        [['read'], { organizationId: 'org1', role: 'CUSTOM', user: {},
            customRole: { organizationId: 'org1', permissions: [{ permission: { code: 'accounts.view' } }] } }, false],
        [['publish'], { organizationId: 'org1', role: 'OWNER', user: {} }, false],
        [['upload'], { organizationId: 'org1', role: 'OWNER', user: {} }, false],
    ])('scope %j grants analytics=%s', async (scopes, member, expected) => {
        mocks.key.mockResolvedValue({ id: 'key1', organizationId: 'org1', userId: 'user1', scopes,
            expiresAt: new Date(Date.now() + 60_000) });
        mocks.member.mockResolvedValue(member);
        const actor = await authenticatePublishingKey(new Request('http://localhost/api/mcp', { headers: bearer() }));
        expect(actor).toMatchObject({ canReadAnalytics: expected });
        const client = await connect(scopes, member);
        const names = (await client.listTools()).tools.map(tool => tool.name);
        await client.close();
        expect(names.includes('get_analytics_summary')).toBe(expected);
        expect(mocks.summary).not.toHaveBeenCalled();
    });
    it('keeps a key alive whose issuer has only analytics.view, without account or publish reads', async () => {
        mocks.key.mockResolvedValue({ id: 'key1', organizationId: 'org1', userId: 'user1', scopes: ['read'],
            expiresAt: new Date(Date.now() + 60_000) });
        mocks.member.mockResolvedValue({ organizationId: 'org1', role: 'CUSTOM', user: {},
            customRole: { organizationId: 'org1', permissions: [{ permission: { code: 'analytics.view' } }] } });
        const actor = await authenticatePublishingKey(new Request('http://localhost/api/mcp', { headers: bearer() }));
        expect(actor).toMatchObject({ canReadAnalytics: true, canRead: false, canPublish: false, canUpload: false });
    });
});

describe('analytics over the real MCP SDK', () => {
    it('advertises, calls, and validates analytics tools for a read key', async () => {
        const client = await connect(['read']);
        try {
            const names = (await client.listTools()).tools.map(tool => tool.name);
            expect(names).toEqual(expect.arrayContaining(['get_analytics_summary', 'get_account_growth',
                'get_top_posts', 'get_post_analytics']));
            expect(names).not.toContain('publish_now');
            expect((await client.callTool({ name: 'get_analytics_summary', arguments: {} })).isError).toBe(false);
            expect((await client.callTool({ name: 'get_top_posts', arguments: { range: '7d', platform: 'youtube' } })).isError).toBe(false);
            const invalid = await client.callTool({ name: 'get_analytics_summary', arguments: { range: 'forever' } });
            expect(invalid.isError).toBe(true);
            expect(JSON.stringify(invalid)).toContain('validation error');
            expect(mocks.summary).not.toHaveBeenCalledWith(expect.objectContaining({ range: 'forever' }));
            expect((await client.callTool({ name: 'get_post_analytics', arguments: { postId: 'post1' } })).isError).toBe(false);
            mocks.post.mockResolvedValueOnce(null);
            const missing = await client.callTool({ name: 'get_post_analytics', arguments: { postId: 'gone' } });
            expect(missing.isError).toBe(true);
            mocks.summary.mockRejectedValueOnce(new Error('Internal analytics database detail'));
            const failed = await client.callTool({ name: 'get_analytics_summary', arguments: {} });
            expect(failed.isError).toBe(true);
            expect(JSON.stringify(failed)).not.toContain('Internal analytics database detail');
        } finally { await client.close(); }
    });
    it('does not advertise analytics tools to a publishing-only key', async () => {
        const client = await connect(['publish']);
        try {
            const names = (await client.listTools()).tools.map(tool => tool.name);
            expect(names).toContain('publish_now');
            expect(names).not.toContain('get_analytics_summary');
            expect(names).not.toContain('get_top_posts');
        } finally { await client.close(); }
        expect(mocks.summary).not.toHaveBeenCalled();
    });
    it('hides analytics tools when the issuer lost analytics.view, and keeps status reads', async () => {
        const client = await connect(['read'], { organizationId: 'org1', role: 'CUSTOM', user: {},
            customRole: { organizationId: 'org1', permissions: [{ permission: { code: 'accounts.view' } }] } });
        try {
            const names = (await client.listTools()).tools.map(tool => tool.name);
            expect(names).not.toContain('get_analytics_summary');
            expect(names).toContain('list_accounts');
        } finally { await client.close(); }
        expect(mocks.summary).not.toHaveBeenCalled();
    });
});
