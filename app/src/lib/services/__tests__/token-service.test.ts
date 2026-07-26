import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { ensureValidToken, handle401Error } from '@/lib/services/token-service';
import { refreshAccessToken } from '@/lib/platforms/oauth';
import { getRedisConnection } from '@/lib/bullmq/connection';

vi.mock('@/lib/db', () => ({
    db: {
        socialAccount: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
    },
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/token-encryption', () => ({
    encryptToken: (token: string) => `encrypted:${token}`,
    decryptToken: (token: string) => token.replace(/^encrypted:/, ''),
}));

vi.mock('@/lib/bullmq/connection', () => ({
    getRedisConnection: vi.fn(),
}));

vi.mock('@/lib/platforms/oauth', () => ({
    refreshAccessToken: vi.fn(),
}));

vi.mock('@/lib/platforms/credentials', () => ({
    getCredentialsForPlatform: vi.fn().mockResolvedValue({
        clientId: 'client-id',
        clientSecret: 'client-secret',
    }),
}));

const redis = {
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
};

function account(overrides: Record<string, unknown> = {}) {
    return {
        id: 'account-1',
        platform: 'YOUTUBE',
        accessToken: 'encrypted:old-access',
        refreshToken: 'encrypted:refresh-token',
        tokenExpiry: new Date(Date.now() + 10 * 60 * 1000),
        lastRefreshAt: null,
        isActive: true,
        ...overrides,
    };
}

describe('token-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        redis.set.mockResolvedValue('OK');
        redis.get.mockResolvedValue(null);
        redis.del.mockResolvedValue(1);
        vi.mocked(getRedisConnection).mockReturnValue(redis as never);
        vi.mocked(db.socialAccount.update).mockResolvedValue({} as never);
    });

    it('honours an explicit sweep threshold instead of the default five minutes', async () => {
        vi.mocked(db.socialAccount.findUnique).mockResolvedValue(account() as never);
        vi.mocked(refreshAccessToken).mockResolvedValue({
            accessToken: 'new-access',
            refreshToken: 'refresh-token',
            expiresIn: 3600,
        });

        const result = await ensureValidToken('account-1', { refreshThresholdMs: 15 * 60 * 1000 });

        expect(result).toMatchObject({ success: true, refreshed: true, accessToken: 'new-access' });
        expect(refreshAccessToken).toHaveBeenCalledWith(
            'youtube',
            'refresh-token',
            expect.any(Object)
        );
    });

    it('reports a still-valid token as not refreshed', async () => {
        vi.mocked(db.socialAccount.findUnique).mockResolvedValue(account() as never);

        const result = await ensureValidToken('account-1');

        expect(result).toEqual({ success: true, accessToken: 'old-access', refreshed: false });
        expect(refreshAccessToken).not.toHaveBeenCalled();
    });

    it('keeps the account active after a transient refresh failure', async () => {
        vi.mocked(db.socialAccount.findUnique).mockResolvedValue(account({
            tokenExpiry: new Date(Date.now() - 1000),
        }) as never);
        vi.mocked(refreshAccessToken).mockRejectedValue(new Error('HTTP 503 service unavailable'));

        const result = await ensureValidToken('account-1');

        expect(result).toMatchObject({ success: false, needsReconnect: false, refreshed: false });
        expect(db.socialAccount.update).not.toHaveBeenCalledWith(
            expect.objectContaining({ data: { isActive: false } })
        );
    });

    it('marks reconnect required for a permanently revoked refresh grant', async () => {
        vi.mocked(db.socialAccount.findUnique).mockResolvedValue(account({
            tokenExpiry: new Date(Date.now() - 1000),
        }) as never);
        vi.mocked(refreshAccessToken).mockRejectedValue(new Error('invalid_grant: token revoked'));

        const result = await ensureValidToken('account-1');

        expect(result).toMatchObject({ success: false, needsReconnect: true, refreshed: false });
        expect(db.socialAccount.update).toHaveBeenCalledWith({
            where: { id: 'account-1' },
            data: { isActive: false },
        });
    });

    it('uses stored Instagram Page tokens until Meta reports an authentication failure', async () => {
        vi.mocked(db.socialAccount.findUnique).mockResolvedValue(account({
            platform: 'INSTAGRAM',
            refreshToken: 'encrypted:not-a-real-refresh-token',
            tokenExpiry: new Date(Date.now() - 1000),
        }) as never);

        const result = await ensureValidToken('account-1');

        expect(result).toMatchObject({ success: true, accessToken: 'old-access', refreshed: false });
        expect(refreshAccessToken).not.toHaveBeenCalled();
        expect(db.socialAccount.update).not.toHaveBeenCalledWith({
            where: { id: 'account-1' },
            data: { isActive: false },
        });
    });

    it('requires Meta reconnect after an API-confirmed authentication failure', async () => {
        vi.mocked(db.socialAccount.findUnique).mockResolvedValue(account({
            platform: 'INSTAGRAM',
            refreshToken: null,
        }) as never);

        const result = await handle401Error('account-1', '401');

        expect(result).toMatchObject({ success: false, needsReconnect: true, refreshed: false });
        expect(db.socialAccount.update).toHaveBeenCalledWith({
            where: { id: 'account-1' },
            data: { isActive: false },
        });
    });

    it('refreshes Threads with its access token when no refresh token exists', async () => {
        vi.mocked(db.socialAccount.findUnique).mockResolvedValue(account({
            platform: 'THREADS',
            refreshToken: null,
            tokenExpiry: new Date(Date.now() - 1000),
        }) as never);
        vi.mocked(refreshAccessToken).mockResolvedValue({
            accessToken: 'new-threads-token',
            expiresIn: 5184000,
        });

        const result = await ensureValidToken('account-1');

        expect(result).toMatchObject({ success: true, refreshed: true });
        expect(refreshAccessToken).toHaveBeenCalledWith(
            'threads',
            'old-access',
            expect.any(Object)
        );
    });

    it('force-refreshes a 401 without first overwriting the stored expiry', async () => {
        vi.mocked(db.socialAccount.findUnique).mockResolvedValue(account({
            tokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
        }) as never);
        vi.mocked(refreshAccessToken).mockResolvedValue({ accessToken: 'new-access', expiresIn: 3600 });

        const result = await handle401Error('account-1', '401');

        expect(result.success).toBe(true);
        expect(db.socialAccount.update).not.toHaveBeenCalledWith(
            expect.objectContaining({ data: { tokenExpiry: new Date(0) } })
        );
    });

    it('does not return an expired token when lock contention times out', async () => {
        vi.useFakeTimers();
        try {
            const expired = account({ tokenExpiry: new Date(Date.now() - 1000) });
            vi.mocked(db.socialAccount.findUnique).mockResolvedValue(expired as never);
            redis.set.mockResolvedValue(null);

            const pending = ensureValidToken('account-1');
            await vi.runAllTimersAsync();
            const result = await pending;

            expect(result).toMatchObject({ success: false, needsReconnect: false, refreshed: false });
            expect(result.accessToken).toBeUndefined();
        } finally {
            vi.useRealTimers();
        }
    });

    it('accepts a valid refresh committed before the waiter read its baseline', async () => {
        const refreshed = account({
            accessToken: 'encrypted:new-access',
            tokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
            lastRefreshAt: new Date(),
            lastRefreshError: null,
        });
        vi.mocked(db.socialAccount.findUnique).mockResolvedValue(refreshed as never);
        redis.set.mockResolvedValue(null);
        redis.get.mockResolvedValue(null);

        const result = await ensureValidToken('account-1', { forceRefresh: true });

        expect(result).toMatchObject({ success: true, accessToken: 'new-access', refreshed: true });
    });
});
