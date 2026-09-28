// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { post: { findMany: mocks.findMany } } }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));

const post = {
    id: 'stuck-tiktok', organizationId: 'org', caption: 'Video awaiting upload',
    platform: 'TIKTOK', status: 'FAILED', scheduledAt: new Date('2026-09-20T10:00:00Z'),
    publishedAt: null, createdAt: new Date('2026-09-20T09:00:00Z'),
    platformPostId: null, externalId: null, isExternal: false,
    media: [], errors: [{ errorHuman: 'TikTok received no video bytes before the upload session expired.', suggestion: 'Retry publishing.' }],
};

function request(start: string, end: string, timezone = 'UTC') {
    return new NextRequest(`http://localhost/api/calendar?${new URLSearchParams({ start, end, timezone })}`);
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T15:00:00Z'));
    mocks.auth.mockResolvedValue({ user: { currentOrganizationId: 'org' } });
});
afterEach(() => vi.useRealTimers());

describe('failed post calendar visibility', () => {
    it('fetches overdue failures and keeps them on today after publishing expires', async () => {
        mocks.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([post]);
        const response = await GET(request('2026-09-28', '2026-09-28'));
        const data = await response.json();
        expect(mocks.findMany.mock.calls[1][0].where).toMatchObject({
            organizationId: 'org', OR: expect.arrayContaining([
                { status: 'FAILED', scheduledAt: { lt: new Date() } },
                { status: 'FAILED', scheduledAt: null, publishedAt: { lt: new Date() } },
            ]),
        });
        expect(data.posts['2026-09-28']).toEqual([expect.objectContaining({
            id: post.id, status: 'failed', latestError: {
                message: post.errors[0].errorHuman, suggestion: 'Retry publishing.',
            },
        })]);
    });

    it('keeps failures on their original date when viewing history', async () => {
        mocks.findMany.mockResolvedValueOnce([post]);
        const data = await (await GET(request('2026-09-20', '2026-09-20'))).json();
        expect(mocks.findMany).toHaveBeenCalledTimes(1);
        expect(data.posts['2026-09-20'][0].id).toBe(post.id);
        expect(data.posts['2026-09-28']).toBeUndefined();
    });

    it('deduplicates the failed post and uses the viewer timezone for today', async () => {
        mocks.findMany.mockResolvedValueOnce([post]).mockResolvedValueOnce([post]);
        const data = await (await GET(request('2026-09-01', '2026-09-30', 'Australia/Sydney'))).json();
        expect(data.totalPosts).toBe(1);
        expect(Object.keys(data.posts)).toEqual(['2026-09-29']);
        expect(data.posts['2026-09-29']).toHaveLength(1);
    });
});
