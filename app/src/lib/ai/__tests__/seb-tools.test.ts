// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    media: vi.fn(), mediaFirst: vi.fn(), post: vi.fn(), postFirst: vi.fn(), postUpdate: vi.fn(),
    postUpdateMany: vi.fn(), accounts: vi.fn(), activityCreate: vi.fn(), hashtag: vi.fn(),
    createPosts: vi.fn(), reschedule: vi.fn(), conflict: vi.fn(), summary: vi.fn(), growth: vi.fn(), top: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: {
    media: { findMany: mocks.media, findFirst: mocks.mediaFirst },
    post: { findMany: mocks.post, findFirst: mocks.postFirst, update: mocks.postUpdate, updateMany: mocks.postUpdateMany },
    socialAccount: { findMany: mocks.accounts },
    hashtag: { upsert: mocks.hashtag },
    activity: { create: mocks.activityCreate },
} }));
vi.mock('@/lib/posts-service', () => ({ createPosts: mocks.createPosts }));
vi.mock('@/lib/queue', () => ({ reschedulePost: mocks.reschedule }));
vi.mock('@/lib/schedule-conflicts', () => ({
    findScheduleConflict: mocks.conflict,
    formatScheduleConflictError: () => 'That slot clashes with another post.',
}));
vi.mock('@/lib/cache', () => ({ invalidatePostCaches: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
// Keep the real argument schema; stub only numbers that are tested where they are computed.
vi.mock('@/lib/mcp/analytics', async importOriginal => ({
    ...await importOriginal<typeof import('@/lib/mcp/analytics')>(),
    analyticsSummary: mocks.summary, accountGrowth: mocks.growth, topPosts: mocks.top,
}));
vi.mock('@/app/(dashboard)/analytics/analytics-data', () => ({ fetchAnalyticsData: vi.fn(), processEngagementData: vi.fn(), calcChange: vi.fn(), fetchAccountGrowth: vi.fn() }));
vi.mock('@/app/(dashboard)/analytics/analytics-data-video', () => ({ fetchTopPerformingPosts: vi.fn() }));

import { PERMISSIONS } from '@/lib/auth/permissions';
import { allowedToolNames, availableSebTools, runSebTool, sebToolDefinitions, type SebToolContext } from '../seb-tools';

type Outcome = Awaited<ReturnType<typeof runSebTool>>;
/** What the model sees, and the card the member sees, read the way each test needs them. */
const said = (result: Outcome) => result.content as Record<string, any>;
const card = (result: Outcome) => result.artifacts[0] as Record<string, any>;

const ctx = (permissions: string[] = Object.values(PERMISSIONS)): SebToolContext => ({
    organizationId: 'org-1', userId: 'user-1', userName: 'Ada', timezone: 'Europe/London',
    permissions: new Set(permissions),
});
const all = allowedToolNames(ctx().permissions, true);
const future = () => new Date(Date.now() + 3_600_000);

const mediaRow = { id: 'm1', filename: 'launch-reel.mp4', mimeType: 'video/mp4', url: 'https://cdn/original', transcodedUrl: null, thumbnailUrl: null, width: null, height: null, duration: 42, size: 1024, altText: 'A launch reel', tags: ['launch'], aiTags: [], folder: { name: 'Campaigns' }, _count: { posts: 2 } };
const postRow = (id = 'p1', status = 'DRAFT') => ({ id, caption: 'Something worth saying', status, platform: 'INSTAGRAM', scheduledAt: new Date('2026-11-08T17:00:00Z'), publishedAt: null, postType: 'REEL', socialAccount: { name: 'Instagram main' }, media: [{ media: { thumbnailUrl: 'https://cdn/t.jpg', url: 'https://cdn/t.jpg', mimeType: 'image/jpeg' } }] });

beforeEach(() => { vi.clearAllMocks(); mocks.conflict.mockResolvedValue(null); mocks.growth.mockResolvedValue({ totals: { followers: 120, followerChange: 4 } }); mocks.activityCreate.mockResolvedValue({}); });

describe('tool discovery', () => {
    it('offers write tools only with the grants they need', () => {
        const names = (permissions: string[]) => availableSebTools(new Set(permissions), true).map(tool => tool.name);
        expect(names([PERMISSIONS.MEDIA_VIEW])).toEqual(['search_media', 'get_media_details']);
        expect(names([PERMISSIONS.POSTS_CREATE])).toContain('draft_post');
        expect(names([])).toEqual([]);
    });

    it('offers nothing to a model that cannot call tools', () => {
        expect(availableSebTools(ctx().permissions, false)).toEqual([]);
        expect(sebToolDefinitions(availableSebTools(ctx().permissions, false))).toEqual([]);
    });

    it('names exactly the tools it hands the provider', () => {
        expect(sebToolDefinitions(availableSebTools(ctx().permissions, true)).map(tool => tool.function.name).sort())
            .toEqual([...allowedToolNames(ctx().permissions, true)].sort());
    });
});

describe('search_media', () => {
    it('returns previews and keeps the query inside one organization', async () => {
        mocks.media.mockResolvedValue([mediaRow]);
        const result = await runSebTool('search_media', JSON.stringify({ query: 'launch', type: 'video' }), ctx(), all);

        expect(result.trace.ok).toBe(true);
        expect(mocks.media.mock.calls[0][0].where).toMatchObject({ organizationId: 'org-1', mimeType: { startsWith: 'video/' } });
        expect(card(result)).toMatchObject({ kind: 'media', items: [{ id: 'm1', type: 'video', usedInPosts: 2 }] });
        // With no thumbnail, the clip itself has to be what chat plays.
        expect(card(result).items[0].previewUrl).toBe('https://cdn/original');
        expect(result.trace.label).toBe('Searched your media library for “launch”');
    });

    it('says so when nothing matches instead of inventing a library', async () => {
        mocks.media.mockResolvedValue([]);
        const result = await runSebTool('search_media', '{}', ctx(), all);
        expect(said(result)).toMatchObject({ count: 0, media: [] });
        expect(result.artifacts).toEqual([]);
    });

    it('refuses a tool the member cannot see, even one the schema offered', async () => {
        const result = await runSebTool('search_media', '{}', ctx([PERMISSIONS.ACCOUNTS_VIEW]), new Set(['search_media']));
        expect(result.trace.ok).toBe(false);
        expect(mocks.media).not.toHaveBeenCalled();
    });
});

describe('get_media_details', () => {
    it('hands Seb his own earlier read, labelled as such', async () => {
        mocks.mediaFirst.mockResolvedValue({ ...mediaRow, sebAnalyses: [{ analysis: 'A person unboxing the launch kit.' }], posts: [{ post: { id: 'p9', status: 'PUBLISHED', platform: 'INSTAGRAM', scheduledAt: null } }] });
        const result = await runSebTool('get_media_details', JSON.stringify({ mediaId: 'm1' }), ctx(), all);
        expect(said(result).previousVisualAnalysis).toBe('A person unboxing the launch kit.');
        expect(said(result).note).toContain('earlier read');
        expect(said(result).usedIn).toEqual([{ postId: 'p9', status: 'published', platform: 'instagram', scheduledAt: null }]);
    });

    it('cannot reach into another workspace’s library', async () => {
        mocks.mediaFirst.mockResolvedValue(null);
        const result = await runSebTool('get_media_details', JSON.stringify({ mediaId: 'elsewhere' }), ctx(), all);
        expect(said(result)).toEqual({ error: 'Media not found in this workspace.' });
    });
});

describe('reads of the calendar and the ledger', () => {
    it('counts a post that is mid-publish as still coming up', async () => {
        mocks.post.mockResolvedValue([postRow('p1', 'SCHEDULED')]);
        const result = await runSebTool('list_posts', JSON.stringify({ status: 'scheduled' }), ctx(), all);
        expect(mocks.post.mock.calls[0][0].where.status).toEqual({ in: ['SCHEDULED', 'PUBLISHING'] });
        expect(said(result).posts[0]).toMatchObject({ postId: 'p1', accountName: 'Instagram main' });
    });

    it('gives account ids in the shape draft_post needs', async () => {
        mocks.accounts.mockResolvedValue([{ id: 'a1', platform: 'INSTAGRAM', name: 'Main', username: 'main' }]);
        const result = await runSebTool('list_accounts', '', ctx(), all);
        expect(said(result).accounts).toEqual([{ accountId: 'a1', platform: 'instagram', name: 'Main', username: 'main', manualOnly: false }]);
    });

    it('turns a summary into a metrics card', async () => {
        mocks.summary.mockResolvedValue({
            range: '30d', platform: 'ALL', hasData: true,
            posts: { published: 9, createdChangePercent: 20 },
            engagement: { likes: 100, comments: 10, saves: 4, reach: 1000, engagementRatePercent: 3.5, changePercent: { likes: 12, comments: 0, saves: -5, reach: 8 } },
            postMetricsSyncedAt: new Date('2026-11-01'), metricNote: 'Metrics are from the last sync.',
        });
        const result = await runSebTool('get_analytics_summary', '{}', ctx(), all);
        expect(card(result)).toMatchObject({ kind: 'metrics' });
        // The member reads a card, so the first row is the one the summary leads with.
        expect(card(result).rows[0]).toMatchObject({ label: 'Posts published', value: '9', change: 20 });
        expect(card(result).rows.some((row: { label: string }) => row.label === 'Followers')).toBe(true);
        expect(said(result).metricNote).toContain('last sync');
    });

    it('keeps top posts in the order analytics ranked them', async () => {
        mocks.top.mockResolvedValue({ range: '30d', platform: 'ALL', note: 'Ranked by engagement rate.', posts: [{ postId: 'p2' }, { postId: 'p1' }] });
        mocks.post.mockResolvedValue([postRow('p1'), postRow('p2')]);
        const result = await runSebTool('get_top_posts', '{}', ctx(), all);
        expect(card(result).posts.map((post: { id: string }) => post.id)).toEqual(['p2', 'p1']);
    });
});

describe('draft_post', () => {
    const args = { caption: 'Something worth saying', accountIds: ['a1'], mediaIds: ['m1'], hashtags: ['launch'] };

    it('writes through the posts service, as a draft, as the member', async () => {
        mocks.accounts.mockResolvedValue([{ id: 'a1' }]);
        mocks.media.mockResolvedValue([{ id: 'm1' }]);
        mocks.createPosts.mockResolvedValue({ posts: [{ id: 'p1' }] });
        mocks.post.mockResolvedValue([postRow()]);

        const result = await runSebTool('draft_post', JSON.stringify(args), ctx(), all);

        expect(mocks.createPosts.mock.calls[0][0]).toMatchObject({
            organizationId: 'org-1', userId: 'user-1', userName: 'Ada (via Seb)', autoPublish: false,
            platformAccountIds: ['a1'], mediaIds: ['m1'], caption: 'Something worth saying',
        });
        expect(mocks.postUpdateMany.mock.calls[0][0]).toMatchObject({ data: { isAiGenerated: true } });
        expect(mocks.activityCreate.mock.calls[0][0].data).toMatchObject({ action: 'created', resourceId: 'p1' });
        expect(card(result)).toMatchObject({ kind: 'posts', write: true, posts: [{ id: 'p1', accountName: 'Instagram main' }] });
        expect(said(result).note).toBe('Saved as drafts. Nothing is scheduled or published yet.');
    });

    it('refuses creative or accounts it cannot find in this workspace', async () => {
        mocks.accounts.mockResolvedValue([{ id: 'a1' }]);
        mocks.media.mockResolvedValue([]);
        const result = await runSebTool('draft_post', JSON.stringify(args), ctx(), all);
        expect(result.trace.ok).toBe(false);
        expect(said(result).error).toContain('m1');
        expect(mocks.createPosts).not.toHaveBeenCalled();
    });

    it('records a reminder rather than a publish when it schedules', async () => {
        const scheduledAt = new Date(Date.now() + 86_400_000).toISOString();
        mocks.accounts.mockResolvedValue([{ id: 'a1' }]);
        mocks.media.mockResolvedValue([{ id: 'm1' }]);
        mocks.createPosts.mockResolvedValue({ posts: [{ id: 'p1' }] });
        mocks.post.mockResolvedValue([postRow('p1', 'SCHEDULED')]);

        const result = await runSebTool('draft_post', JSON.stringify({ ...args, scheduledAt }), ctx(), all);

        expect(mocks.createPosts.mock.calls[0][0]).toMatchObject({ autoPublish: false, scheduledAt });
        expect(said(result).note).toBe('Saved with a publish reminder. Seb did not queue an automatic publish.');
        expect(card(result).title).toBe('Scheduled from chat');
    });

    it('passes the service error straight to the model', async () => {
        mocks.accounts.mockResolvedValue([{ id: 'a1' }]);
        mocks.media.mockResolvedValue([{ id: 'm1' }]);
        mocks.createPosts.mockResolvedValue({ error: 'Instagram account needs to be reconnected' });
        const result = await runSebTool('draft_post', JSON.stringify(args), ctx(), all);
        expect(said(result)).toEqual({ error: 'Instagram account needs to be reconnected' });
        expect(mocks.activityCreate).not.toHaveBeenCalled();
    });
});

describe('update_draft', () => {
    it('replaces media only when every id belongs to the workspace', async () => {
        mocks.postFirst.mockResolvedValue({ id: 'p1', status: 'DRAFT', platformPostId: null });
        mocks.media.mockResolvedValue([{ id: 'm2' }]);
        mocks.post.mockResolvedValue([postRow()]);

        const result = await runSebTool('update_draft', JSON.stringify({ postId: 'p1', mediaIds: ['m2'] }), ctx(), all);

        expect(mocks.postUpdate.mock.calls[0][0].data).toMatchObject({ customMediaIds: ['m2'], media: { create: [{ mediaId: 'm2', order: 0 }] } });
        expect(result.trace.ok).toBe(true);
    });

    it('leaves anything already sent to a platform alone', async () => {
        mocks.postFirst.mockResolvedValue({ id: 'p1', status: 'PUBLISHED', platformPostId: '1789' });
        const result = await runSebTool('update_draft', JSON.stringify({ postId: 'p1', caption: 'New' }), ctx(), all);
        expect(result.trace.ok).toBe(false);
        expect(said(result).error).toContain('published');
        expect(mocks.postUpdate).not.toHaveBeenCalled();
    });

    it('refuses a post from another organization without confirming it exists', async () => {
        mocks.postFirst.mockResolvedValue(null);
        const result = await runSebTool('update_draft', JSON.stringify({ postId: 'elsewhere', caption: 'New' }), ctx(), all);
        expect(said(result)).toEqual({ error: 'Post not found in this workspace.' });
    });
});

describe('schedule_draft', () => {
    it('uses the queue helper and leaves auto-publish alone', async () => {
        mocks.postFirst.mockResolvedValue({ id: 'p1', status: 'DRAFT', platformPostId: null, platform: 'INSTAGRAM' });
        mocks.reschedule.mockResolvedValue({ scheduledAt: future() });
        mocks.post.mockResolvedValue([postRow('p1', 'SCHEDULED')]);

        const result = await runSebTool('schedule_draft', JSON.stringify({ postId: 'p1', scheduledAt: future().toISOString() }), ctx(), all);

        expect(mocks.reschedule.mock.calls[0][0]).toBe('p1');
        expect(card(result)).toMatchObject({ title: 'On the calendar', write: true });
        expect(said(result).note).toBe('Reminder set. Its auto-publish setting is unchanged.');
    });

    it('stops a time the model has already misread as future', async () => {
        mocks.postFirst.mockResolvedValue({ id: 'p1', status: 'DRAFT', platformPostId: null, platform: 'INSTAGRAM' });
        const result = await runSebTool('schedule_draft', JSON.stringify({ postId: 'p1', scheduledAt: new Date(Date.now() - 600_000).toISOString() }), ctx(), all);
        expect(said(result).error).toContain('must be in the future');
        expect(mocks.reschedule).not.toHaveBeenCalled();
    });

    it('will not move a post that has already been published', async () => {
        mocks.postFirst.mockResolvedValue({ id: 'p1', status: 'PUBLISHED', platformPostId: '1789', platform: 'INSTAGRAM' });
        const result = await runSebTool('schedule_draft', JSON.stringify({ postId: 'p1', scheduledAt: future().toISOString() }), ctx(), all);
        expect(result.trace.ok).toBe(false);
        expect(mocks.reschedule).not.toHaveBeenCalled();
    });

    it('reports a clash instead of double-booking the account', async () => {
        mocks.postFirst.mockResolvedValue({ id: 'p1', status: 'DRAFT', platformPostId: null, platform: 'INSTAGRAM' });
        mocks.conflict.mockResolvedValue({ post: {} });
        const result = await runSebTool('schedule_draft', JSON.stringify({ postId: 'p1', scheduledAt: future().toISOString() }), ctx(), all);
        expect(said(result)).toEqual({ error: 'That slot clashes with another post.' });
    });
});

describe('a tool call that never should have happened', () => {
    it('answers for a tool that is not in this conversation', async () => {
        const result = await runSebTool('drop_database', '{}', ctx(), new Set<string>());
        expect(result.trace.ok).toBe(false);
        expect(result.trace.label).toBe('Tried a tool that is not available here');
    });

    it('answers for half-written arguments', async () => {
        const result = await runSebTool('search_media', '{"query": "launch"', ctx(), all);
        expect(said(result)).toEqual({ error: 'Tool arguments were not valid JSON. Retry with complete arguments.' });
    });

    it('answers for a write that threw, and says the outcome is uncertain', async () => {
        mocks.accounts.mockRejectedValue(new Error('database down'));
        const result = await runSebTool('draft_post', JSON.stringify({ caption: 'Hi', accountIds: ['a1'], mediaIds: [] }), ctx(), all);
        expect(result.trace.ok).toBe(false);
        expect(String(said(result).error)).toContain('check the app');
    });

    it('answers for a lookup that threw without alarming anyone', async () => {
        mocks.media.mockRejectedValue(new Error('database down'));
        const result = await runSebTool('search_media', '{}', ctx(), all);
        expect(String(said(result).error)).toContain('Answer from the supplied context');
    });
});
