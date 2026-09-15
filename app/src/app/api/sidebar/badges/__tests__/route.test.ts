// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';
import { buildInboxAttentionCountQuery } from '@/app/api/inbox/query';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/db', () => ({ db: { $queryRaw: mocks.query } }));
vi.mock('@/app/api/inbox/query', () => ({ buildInboxAttentionCountQuery: vi.fn(() => 'attention-query') }));

describe('sidebar badges', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('requires an organization before querying engagement', async () => {
        mocks.auth.mockResolvedValue({ user: {} });
        expect((await GET()).status).toBe(401);
        expect(mocks.query).not.toHaveBeenCalled();
    });

    it.each([0, 7])('returns the canonical attention count %i without stale HTTP caching', async (total) => {
        mocks.auth.mockResolvedValue({ user: { currentOrganizationId: 'org' } });
        mocks.query.mockResolvedValue([{ total }]);
        const response = await GET();
        expect(buildInboxAttentionCountQuery).toHaveBeenCalledWith('org');
        expect(mocks.query).toHaveBeenCalledWith('attention-query');
        expect(await response.json()).toEqual({ engagement: total, analytics: 0 });
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    });
});
