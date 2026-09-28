// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/db', () => ({ db: { notificationSettings: { findUnique: mocks.findUnique, upsert: mocks.upsert } } }));
import { GET, PATCH } from '@/app/api/settings/notifications/route';

beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'user', currentOrganizationId: 'workspace' } });
    mocks.findUnique.mockResolvedValue(null);
});

function request(body: unknown) {
    return new NextRequest('http://localhost/api/settings/notifications', {
        method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
    });
}

describe('listening notification preference', () => {
    it('defaults to receiving alerts from opted-in monitors', async () => {
        expect(await (await GET()).json()).toMatchObject({ listeningAlerts: true });
        expect(mocks.findUnique).toHaveBeenCalledWith({ where: { organizationId_userId: { organizationId: 'workspace', userId: 'user' } } });
    });

    it('returns a saved veto and persists only the current user/workspace', async () => {
        mocks.findUnique.mockResolvedValue({ listeningAlerts: false });
        expect(await (await GET()).json()).toMatchObject({ listeningAlerts: false });
        mocks.upsert.mockResolvedValue({ listeningAlerts: false });
        const response = await PATCH(request({ listeningAlerts: false, organizationId: 'foreign', userId: 'foreign' }));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ listeningAlerts: false });
        expect(mocks.upsert).toHaveBeenCalledWith({
            where: { organizationId_userId: { organizationId: 'workspace', userId: 'user' } },
            create: { organizationId: 'workspace', userId: 'user', listeningAlerts: false },
            update: { listeningAlerts: false },
        });
    });

    it.each([null, [], 'invalid', { listeningAlerts: 'false' }, { listeningAlerts: 0 }])('rejects invalid preference input %j', async body => {
        expect((await PATCH(request(body))).status).toBe(400);
        expect(mocks.upsert).not.toHaveBeenCalled();
    });

    it('requires an authenticated workspace', async () => {
        mocks.auth.mockResolvedValue(null);
        expect((await GET()).status).toBe(401);
        expect((await PATCH(request({ listeningAlerts: false }))).status).toBe(401);
        expect(mocks.upsert).not.toHaveBeenCalled();
    });
});
