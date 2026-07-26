import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processTokenRefreshSweep } from '@/workers/token-refresh-worker';
import { db } from '@/lib/db';
import * as tokenService from '@/lib/services/token-service';
import * as avatarRefresh from '@/lib/services/avatar-refresh';
import { Job } from 'bullmq';

vi.mock('@/lib/db', () => ({
    db: {
        socialAccount: { findMany: vi.fn(), update: vi.fn() },
        notification: { findFirst: vi.fn(), create: vi.fn() }
    }
}));

vi.mock('@/lib/services/token-service', () => ({
    ensureValidToken: vi.fn()
}));

vi.mock('@/lib/services/avatar-refresh', () => ({
    refreshAccountAvatar: vi.fn()
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

describe('token-refresh-worker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('does nothing if no accounts need refreshing', async () => {
        vi.mocked(db.socialAccount.findMany).mockResolvedValue([]);
        
        await processTokenRefreshSweep({} as Job<any>);
        
        expect(tokenService.ensureValidToken).not.toHaveBeenCalled();
    });

    it('uses the sweep threshold and does not duplicate refresh accounting writes', async () => {
        vi.mocked(db.socialAccount.findMany).mockResolvedValue([
            { id: 'acc-1', platform: 'TWITTER', name: 'Test', organizationId: 'org-1' } as any
        ]);

        vi.mocked(tokenService.ensureValidToken).mockResolvedValue({
            success: true,
            accessToken: 'ok',
            refreshed: true,
        });
        vi.mocked(avatarRefresh.refreshAccountAvatar).mockResolvedValue({ updated: true });

        await processTokenRefreshSweep({} as Job<any>);

        expect(tokenService.ensureValidToken).toHaveBeenCalledWith('acc-1', {
            refreshThresholdMs: 15 * 60 * 1000,
        });
        expect(db.socialAccount.update).not.toHaveBeenCalled();
        // Twitter should not trigger avatar refresh (only META_PLATFORMS)
        expect(avatarRefresh.refreshAccountAvatar).not.toHaveBeenCalled();
    });

    it('triggers avatar refresh for refreshable Threads accounts on success', async () => {
        vi.mocked(db.socialAccount.findMany).mockResolvedValue([
            { id: 'acc-meta', platform: 'THREADS', name: 'Threads', organizationId: 'org-1' } as any
        ]);

        vi.mocked(tokenService.ensureValidToken).mockResolvedValue({
            success: true,
            accessToken: 'ok',
            refreshed: true,
        });
        vi.mocked(avatarRefresh.refreshAccountAvatar).mockResolvedValue({ updated: true });

        await processTokenRefreshSweep({} as Job<any>);

        expect(tokenService.ensureValidToken).toHaveBeenCalledWith('acc-meta', {
            refreshThresholdMs: 15 * 60 * 1000,
        });
        expect(avatarRefresh.refreshAccountAvatar).toHaveBeenCalledWith('acc-meta');
    });

    it('does not claim a refresh or refresh avatars for a non-refresh success', async () => {
        vi.mocked(db.socialAccount.findMany).mockResolvedValue([
            { id: 'acc-race', platform: 'THREADS', name: 'Threads', organizationId: 'org-1' } as any
        ]);
        vi.mocked(tokenService.ensureValidToken).mockResolvedValue({
            success: true,
            accessToken: 'still-valid',
            refreshed: false,
        });

        await processTokenRefreshSweep({} as Job<any>);

        expect(avatarRefresh.refreshAccountAvatar).not.toHaveBeenCalled();
        expect(db.socialAccount.update).not.toHaveBeenCalled();
    });

    it('includes accounts without refresh tokens so the strategy can resolve them', async () => {
        vi.mocked(db.socialAccount.findMany).mockResolvedValue([]);

        await processTokenRefreshSweep({} as Job<any>);

        expect(db.socialAccount.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.not.objectContaining({ refreshToken: expect.anything() }),
            })
        );
        expect(db.socialAccount.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    platform: { notIn: ['MANUAL', 'FACEBOOK', 'INSTAGRAM'] },
                }),
            })
        );
    });

    it('updates lastRefreshError and creates notification on reconnect failure', async () => {
        vi.mocked(db.socialAccount.findMany).mockResolvedValue([
            { id: 'acc-fail', platform: 'LINKEDIN', name: 'LI', organizationId: 'org-1' } as any
        ]);

        vi.mocked(tokenService.ensureValidToken).mockResolvedValue({ 
            success: false, 
            error: 'Revoked',
            needsReconnect: true 
        });
        
        vi.mocked(db.notification.findFirst).mockResolvedValue(null); // No existing notification

        await processTokenRefreshSweep({} as Job<any>);

        expect(db.socialAccount.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'acc-fail' },
                data: expect.objectContaining({ lastRefreshError: 'Revoked' })
            })
        );
        expect(db.notification.create).toHaveBeenCalled();
    });

    it('does not create duplicate notifications', async () => {
        vi.mocked(db.socialAccount.findMany).mockResolvedValue([
            { id: 'acc-fail', platform: 'LINKEDIN', name: 'LI', organizationId: 'org-1' } as any
        ]);

        vi.mocked(tokenService.ensureValidToken).mockResolvedValue({ 
            success: false, 
            error: 'Revoked',
            needsReconnect: true 
        });
        
        vi.mocked(db.notification.findFirst).mockResolvedValue({ id: 'existing-notif' } as any);

        await processTokenRefreshSweep({} as Job<any>);

        expect(db.notification.create).not.toHaveBeenCalled();
    });
});
