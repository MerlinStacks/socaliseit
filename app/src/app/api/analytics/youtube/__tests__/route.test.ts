// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), accounts: vi.fn(), posts: vi.fn(), token: vi.fn(), analytics: vi.fn(), fetch: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/db', () => ({ db: { socialAccount: { findMany: mocks.accounts }, post: { findMany: mocks.posts } } }));
vi.mock('@/lib/services/token-service', () => ({ ensureValidToken: mocks.token }));
vi.mock('@/lib/platform-api/youtube-analytics', async importOriginal => ({
    ...await importOriginal<typeof import('@/lib/platform-api/youtube-analytics')>(), fetchYouTubeAnalytics: mocks.analytics,
}));
const account = { id: 'account-1', name: 'Channel One', platformId: 'UC-owned' };
const request = (query = '') => GET(new NextRequest(`http://localhost/api/analytics/youtube${query}`));

describe('GET YouTube analytics', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-15T02:00:00Z'));
        vi.stubGlobal('fetch', mocks.fetch);
        mocks.auth.mockResolvedValue({ user: { currentOrganizationId: 'org-1' } });
        mocks.accounts.mockResolvedValue([account, { id: 'account-2', name: 'Second', platformId: 'UC-second' }]);
        mocks.posts.mockResolvedValue([]);
        mocks.token.mockResolvedValue({ success: true, accessToken: 'refreshed-token' });
        mocks.analytics.mockResolvedValue({ daily: [], summary: null });
        mocks.fetch.mockResolvedValue(Response.json({ items: [{ id: 'abcdefghijk', snippet: { channelId: 'UC-owned', title: 'Owned video' } }] }));
    });
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

    it.each([null, { user: {} }])('requires an authenticated organization: %j', async session => {
        mocks.auth.mockResolvedValue(session);
        expect((await request()).status).toBe(401);
        expect(mocks.accounts).not.toHaveBeenCalled();
    });

    it.each(['?range=14d', '?range=', '?videoId=bad', '?videoId=abcdefghijk%3Bvideo%3D%3Dother', '?accountId='])('validates query %s before database access', async query => {
        expect((await request(query)).status).toBe(400);
        expect(mocks.accounts).not.toHaveBeenCalled();
    });

    it('returns the exact no-account contract', async () => {
        mocks.accounts.mockResolvedValue([]);
        expect(await (await request()).json()).toEqual({ analytics: null, accounts: [], accountId: null, videos: [] });
        expect(mocks.token).not.toHaveBeenCalled();
        expect(mocks.posts).not.toHaveBeenCalled();
    });

    it('scopes active accounts and local videos, defaults to first account and 30 Pacific calendar days', async () => {
        const response = await request();
        expect(mocks.accounts).toHaveBeenCalledWith({ where: { organizationId: 'org-1', platform: 'YOUTUBE', isActive: true },
            select: { id: true, name: true, platformId: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
        expect(mocks.posts).toHaveBeenCalledWith(expect.objectContaining({ where: {
            organizationId: 'org-1', socialAccountId: 'account-1', platform: 'YOUTUBE', status: 'PUBLISHED',
        }, take: 50 }));
        expect(mocks.token).toHaveBeenCalledWith('account-1');
        expect(mocks.analytics).toHaveBeenCalledWith('refreshed-token', 'UC-owned', '2026-08-15', '2026-09-13', undefined);
        expect(await response.json()).toEqual({ analytics: { daily: [], summary: null }, accounts: [
            { id: 'account-1', name: 'Channel One' }, { id: 'account-2', name: 'Second' },
        ], accountId: 'account-1', videos: [] });
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(mocks.fetch).not.toHaveBeenCalled();
    });

    it.each([['7d', '2026-09-07'], ['90d', '2026-06-16']])('honors explicit account and range %s', async (range, start) => {
        expect((await request(`?accountId=account-2&range=${range}`)).status).toBe(200);
        expect(mocks.token).toHaveBeenCalledWith('account-2');
        expect(mocks.analytics).toHaveBeenCalledWith('refreshed-token', 'UC-second', start, '2026-09-13', undefined);
    });

    it('does not fall back for foreign, inactive, or non-YouTube account IDs', async () => {
        expect((await request('?accountId=foreign-account')).status).toBe(404);
        expect(mocks.token).not.toHaveBeenCalled();
        expect(mocks.posts).not.toHaveBeenCalled();
        expect(mocks.analytics).not.toHaveBeenCalled();
    });

    it('selects valid published platform/external IDs and deduplicates', async () => {
        mocks.posts.mockResolvedValue([
            { platformPostId: 'abcdefghijk', externalId: null, videoTitle: 'Title', caption: 'caption' },
            { platformPostId: null, externalId: 'abcdefghijk', videoTitle: 'Title', caption: '' },
            { platformPostId: 'invalid', externalId: '12345678901', videoTitle: null, caption: 'Imported video' },
            { platformPostId: 'invalid', externalId: null, videoTitle: null, caption: '' },
        ]);
        expect((await (await request()).json()).videos).toEqual([
            { id: 'abcdefghijk', title: 'Title' }, { id: '12345678901', title: 'Imported video' },
        ]);
    });

    it('verifies owned video before reports, including IDs outside local posts', async () => {
        const response = await request('?videoId=abcdefghijk');
        const [url, options] = mocks.fetch.mock.calls[0];
        expect(new URL(url).pathname).toBe('/youtube/v3/videos');
        expect(new URL(url).searchParams.get('id')).toBe('abcdefghijk');
        expect(options).toMatchObject({ headers: { Authorization: 'Bearer refreshed-token' }, cache: 'no-store' });
        expect(mocks.fetch.mock.invocationCallOrder[0]).toBeLessThan(mocks.analytics.mock.invocationCallOrder[0]);
        expect(mocks.analytics).toHaveBeenCalledWith('refreshed-token', 'UC-owned', '2026-08-15', '2026-09-13', 'abcdefghijk');
        expect((await response.json()).videos).toEqual([{ id: 'abcdefghijk', title: 'Owned video' }]);
    });

    it.each([
        { items: [] }, { items: [{ id: 'abcdefghijk', snippet: { channelId: 'UC-other', title: 'Other' } }] },
        { items: [{ id: 'differentId', snippet: { channelId: 'UC-owned', title: 'Wrong ID' } }] },
    ])('rejects unowned/missing video even when a local post exists: %j', async ({ items }) => {
        mocks.posts.mockResolvedValue([{ platformPostId: 'abcdefghijk', externalId: null, videoTitle: 'Local', caption: '' }]);
        mocks.fetch.mockResolvedValue(Response.json({ items }));
        expect((await request('?videoId=abcdefghijk')).status).toBe(404);
        expect(mocks.analytics).not.toHaveBeenCalled();
    });

    it.each([401, 403, 429, 500])('fails closed when ownership API returns %i', async status => {
        mocks.fetch.mockResolvedValue(Response.json({ error: {} }, { status }));
        expect((await request('?videoId=abcdefghijk')).status).toBe(502);
        expect(mocks.analytics).not.toHaveBeenCalled();
    });

    it('fails closed on malformed ownership response', async () => {
        mocks.fetch.mockResolvedValue(Response.json({}));
        expect((await request('?videoId=abcdefghijk')).status).toBe(502);
        expect(mocks.analytics).not.toHaveBeenCalled();
    });

    it('fails closed on ownership network errors', async () => {
        mocks.fetch.mockRejectedValue(new Error('network timeout'));
        expect((await request('?videoId=abcdefghijk')).status).toBe(502);
        expect(mocks.analytics).not.toHaveBeenCalled();
    });

    it.each([true, false])('returns report availability when token validation fails (reconnect=%s)', async needsReconnect => {
        mocks.token.mockResolvedValue({ success: false, needsReconnect, error: 'sensitive upstream detail' });
        const response = await request('?videoId=abcdefghijk');
        const body = await response.json();
        expect(response.status).toBe(200);
        expect(body.analytics.summary).toBeNull();
        expect(body.analytics.availability).toEqual(Object.fromEntries(
            ['daily', 'trafficSources', 'summary', 'retention'].map(key => [key, needsReconnect ? 'reconnect_required' : 'unavailable']),
        ));
        expect(JSON.stringify(body)).not.toContain('sensitive');
        expect(mocks.fetch).not.toHaveBeenCalled();
        expect(mocks.analytics).not.toHaveBeenCalled();
    });

    it('does not leak internal failure details', async () => {
        mocks.accounts.mockRejectedValue(new Error('secret database connection'));
        const response = await request();
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Unable to load YouTube analytics' });
    });
});
