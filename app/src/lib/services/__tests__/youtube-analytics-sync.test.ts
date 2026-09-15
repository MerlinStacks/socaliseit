import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { syncPlatformAnalytics, syncSingleAccountAnalytics } from '../platform-analytics-sync';

vi.mock('@/lib/db', () => ({ db: {
    socialAccount: { findMany: vi.fn(), findUnique: vi.fn() },
    platformAnalytics: { findFirst: vi.fn(), upsert: vi.fn() },
} }));
vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/services/token-service', () => ({
    ensureValidToken: async (id: string) => ({ success: true, accessToken: `token-${id}` }),
}));
vi.mock('@/lib/platform-api/instagram-api', () => ({}));
vi.mock('@/lib/platform-api/facebook-api', () => ({}));
vi.mock('@/lib/platform-api/tiktok-api', () => ({}));
vi.mock('@/lib/platform-api/pinterest-api', () => ({}));
vi.mock('@/lib/platform-api/threads-api', () => ({}));
vi.mock('@/lib/platform-api/google-business-api', () => ({}));

const accounts = ['one', 'two'].map(id => ({
    id, organizationId: 'org-1', platform: 'YOUTUBE', platformId: `UC-${id}`, isActive: true,
}));
const fetchMock = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.socialAccount.findMany).mockResolvedValue(accounts as never);
    vi.mocked(db.platformAnalytics.findFirst).mockResolvedValue(null);
    fetchMock.mockImplementation(async (input: string) => {
        const url = new URL(input);
        if (url.pathname.endsWith('/channels')) {
            if (url.searchParams.has('mine')) {
                return { ok: false, json: async () => ({ error: { message: 'mine parameter not supported' } }) };
            }
            return { ok: true, json: async () => ({ items: [{ statistics: {
                subscriberCount: url.searchParams.get('id') === 'UC-one' ? '11' : '22',
                viewCount: '100', videoCount: '3',
            } }] }) };
        }
        return { ok: true, json: async () => ({ rows: [] }) };
    });
    vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('YouTube analytics sync channel routing', () => {
    it.each(['batch', 'single'])('uses each stored channel ID through %s sync and the real API adapter', async (mode) => {
        if (mode === 'batch') {
            expect(await syncPlatformAnalytics('org-1')).toEqual({ accountsSynced: 2, accountsSkipped: 0, errors: [] });
        } else {
            for (const account of accounts) {
                vi.mocked(db.socialAccount.findUnique).mockResolvedValue(account as never);
                expect(await syncSingleAccountAnalytics(account.id)).toEqual({ success: true, platform: 'YOUTUBE' });
            }
        }

        for (const account of accounts) {
            const calls = fetchMock.mock.calls.filter(([, init]) => init.headers.Authorization === `Bearer token-${account.id}`);
            expect(calls).toHaveLength(2);
            const channelUrl = new URL(calls[0][0]);
            expect(channelUrl.searchParams.get('id')).toBe(account.platformId);
            expect(channelUrl.searchParams.has('mine')).toBe(false);
            expect(new URL(calls[1][0]).searchParams.get('ids')).toBe(`channel==${account.platformId}`);
            expect(db.platformAnalytics.upsert).toHaveBeenCalledWith(expect.objectContaining({
                create: expect.objectContaining({
                    socialAccountId: account.id,
                    followers: account.id === 'one' ? 11 : 22,
                    platformMetrics: expect.objectContaining({ private_analytics_availability: 'no_data' }),
                }),
            }));
        }
    });
});
