// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(), findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn(), error: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/db', () => ({ db: { activity: {
    findMany: mocks.findMany, count: mocks.count, groupBy: mocks.groupBy,
} } }));
vi.mock('@/lib/logger', () => ({ logger: { error: mocks.error } }));
import { GET } from '../route';

const get = (params: Record<string, string> = {}) => GET(new NextRequest(
    `http://localhost/api/activity?${new URLSearchParams(params)}`,
));
const activity = {
    id: 'activity-1', organizationId: 'org', userId: null, userName: null,
    action: 'published', resourceType: 'post', resourceId: 'post-1',
    resourceName: 'Launch', details: 'Published successfully',
    createdAt: new Date('2026-09-15T12:00:00.000Z'),
};

beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:05:00.000Z'));
    mocks.auth.mockResolvedValue({ user: { currentOrganizationId: 'org' } });
    mocks.findMany.mockResolvedValue([activity]);
    mocks.count.mockResolvedValue(1);
    mocks.groupBy.mockResolvedValue([{ resourceType: 'post', _count: { _all: 1 } }]);
});
afterEach(() => vi.useRealTimers());

describe('GET /api/activity', () => {
    it('preserves the activity contract and defaults with stable ordering', async () => {
        const response = await get();
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            activities: [{
                id: 'activity-1', user: { name: 'System' }, action: 'published',
                resourceType: 'post', resourceId: 'post-1', resourceName: 'Launch',
                details: 'Published successfully', timestamp: '5 minutes ago',
                createdAt: '2026-09-15T12:00:00.000Z',
            }],
            total: 1, limit: 20, offset: 0, hasMore: false,
            categories: [{ type: 'post', count: 1 }], workspaceTotal: 1,
        });
        expect(mocks.findMany).toHaveBeenCalledWith({
            where: { organizationId: 'org' }, take: 20, skip: 0,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        expect(mocks.count).toHaveBeenCalledWith({ where: { organizationId: 'org' } });
    });

    it.each([
        ['limit', '0'], ['limit', '101'], ['limit', '-1'], ['limit', '1.5'],
        ['limit', '20junk'], ['limit', ''], ['limit', 'NaN'], ['limit', 'Infinity'],
        ['offset', '-1'], ['offset', '0.5'], ['offset', '2junk'], ['offset', ''],
        ['offset', '9007199254740992'], ['type', 'x'.repeat(101)], ['search', 'x'.repeat(201)],
    ])('rejects invalid %s=%s before database queries', async (key, value) => {
        const response = await get({ [key]: value });
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: 'Invalid query parameters' });
        expect(mocks.findMany).not.toHaveBeenCalled();
        expect(mocks.count).not.toHaveBeenCalled();
        expect(mocks.groupBy).not.toHaveBeenCalled();
    });

    it('accepts validation boundaries and arbitrary category names', async () => {
        expect((await get({ limit: '100', offset: '0', type: 'x'.repeat(100), search: 'x'.repeat(200) })).status).toBe(200);
        expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
            take: 100, skip: 0, where: expect.objectContaining({ resourceType: 'x'.repeat(100) }),
        }));
    });

    it.each(['org', 'other-org'])('scopes search, count and unfiltered categories to %s', async organizationId => {
        mocks.auth.mockResolvedValue({ user: { currentOrganizationId: organizationId } });
        mocks.count.mockResolvedValue(0);
        mocks.findMany.mockResolvedValue([]);
        mocks.groupBy.mockResolvedValue([
            { resourceType: 'custom-category', _count: { _all: 3 } },
            { resourceType: 'post', _count: { _all: 7 } },
        ]);
        const response = await get({ type: 'custom-category', search: 'MiXeD', organizationId: 'foreign-org' });
        const where = {
            organizationId, resourceType: 'custom-category',
            OR: [
                { userName: { contains: 'MiXeD', mode: 'insensitive' } },
                { action: { contains: 'MiXeD', mode: 'insensitive' } },
                { resourceName: { contains: 'MiXeD', mode: 'insensitive' } },
                { details: { contains: 'MiXeD', mode: 'insensitive' } },
            ],
        };
        expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
        expect(mocks.count).toHaveBeenCalledWith({ where });
        expect(mocks.groupBy).toHaveBeenCalledWith({
            by: ['resourceType'], where: { organizationId },
            _count: { _all: true }, orderBy: { resourceType: 'asc' },
        });
        expect(await response.json()).toMatchObject({
            activities: [], total: 0, hasMore: false, workspaceTotal: 10,
            categories: [{ type: 'custom-category', count: 3 }, { type: 'post', count: 7 }],
        });
    });

    it.each(['all', ''])('treats type=%s and empty search as unfiltered', async type => {
        await get({ type, search: '' });
        expect(mocks.count).toHaveBeenCalledWith({ where: { organizationId: 'org' } });
    });

    it.each([
        [0, 3, true], [2, 3, false], [5, 3, false],
    ])('returns pagination at offset %i with total %i', async (offset, total, hasMore) => {
        mocks.count.mockResolvedValue(total);
        if (offset > total) mocks.findMany.mockResolvedValue([]);
        const response = await get({ limit: '1', offset: String(offset) });
        expect(await response.json()).toMatchObject({ limit: 1, offset, total, hasMore });
        expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 1, skip: offset }));
    });

    it('returns zero workspace total for an empty organization', async () => {
        mocks.findMany.mockResolvedValue([]);
        mocks.count.mockResolvedValue(0);
        mocks.groupBy.mockResolvedValue([]);
        expect(await (await get()).json()).toMatchObject({
            activities: [], total: 0, categories: [], workspaceTotal: 0, hasMore: false,
        });
    });

    it.each([null, { user: {} }])('requires an authenticated organization', async session => {
        mocks.auth.mockResolvedValue(session);
        expect((await get()).status).toBe(401);
        expect(mocks.findMany).not.toHaveBeenCalled();
        expect(mocks.count).not.toHaveBeenCalled();
        expect(mocks.groupBy).not.toHaveBeenCalled();
    });

    it.each(['auth', 'findMany', 'count', 'groupBy'] as const)('logs and returns 500 when %s fails', async operation => {
        const error = new Error('Internal database or session failure');
        mocks[operation].mockRejectedValue(error);
        const response = await get();
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Failed to fetch activity' });
        expect(mocks.error).toHaveBeenCalledWith({ error }, 'Failed to fetch activity');
    });
});
