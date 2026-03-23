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

    it('processes accounts and updates database on success', async () => {
        vi.mocked(db.socialAccount.findMany).mockResolvedValue([
            { id: 'acc-1', platform: 'TWITTER', name: 'Test', organizationId: 'org-1' } as any
        ]);

        vi.mocked(tokenService.ensureValidToken).mockResolvedValue({ success: true, accessToken: 'ok' });
        vi.mocked(avatarRefresh.refreshAccountAvatar).mockResolvedValue({ updated: true });

        await processTokenRefreshSweep({} as Job<any>);

        expect(tokenService.ensureValidToken).toHaveBeenCalledWith('acc-1');
        expect(db.socialAccount.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'acc-1' },
                data: expect.objectContaining({ lastRefreshError: null })
            })
        );
        // Twitter should not trigger avatar refresh (only META_PLATFORMS)
        expect(avatarRefresh.refreshAccountAvatar).not.toHaveBeenCalled();
    });

    it('triggers avatar refresh for META platforms on success', async () => {
        vi.mocked(db.socialAccount.findMany).mockResolvedValue([
            { id: 'acc-meta', platform: 'INSTAGRAM', name: 'IG', organizationId: 'org-1' } as any
        ]);

        vi.mocked(tokenService.ensureValidToken).mockResolvedValue({ success: true, accessToken: 'ok' });
        vi.mocked(avatarRefresh.refreshAccountAvatar).mockResolvedValue({ updated: true });

        await processTokenRefreshSweep({} as Job<any>);

        expect(tokenService.ensureValidToken).toHaveBeenCalledWith('acc-meta');
        expect(avatarRefresh.refreshAccountAvatar).toHaveBeenCalledWith('acc-meta');
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
