import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, findManyMock, findFirstMock, updateMock } = vi.hoisted(() => ({
    authMock: vi.fn(),
    findManyMock: vi.fn(),
    findFirstMock: vi.fn(),
    updateMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: authMock }));
vi.mock('@/lib/db', () => ({
    db: {
        socialAccount: {
            findMany: findManyMock,
            findFirst: findFirstMock,
            update: updateMock,
        },
    },
}));

import { GET, PATCH } from './route';

describe('GET /api/accounts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authMock.mockResolvedValue({
            user: { currentOrganizationId: 'org-1' },
        });
        findManyMock.mockResolvedValue([]);
    });

    it('queries only the account fields required by frontend consumers', async () => {
        await GET();

        expect(findManyMock).toHaveBeenCalledWith({
            where: { organizationId: 'org-1' },
            select: {
                id: true,
                platform: true,
                name: true,
                username: true,
                customPlatformName: true,
                avatar: true,
                tokenExpiry: true,
                lastRefreshError: true,
                isActive: true,
                organizationId: true,
                organization: {
                    select: {
                        id: true,
                        name: true,
                        logo: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        const query = findManyMock.mock.calls[0][0];
        expect(query.select).not.toHaveProperty('accessToken');
        expect(query.select).not.toHaveProperty('refreshToken');
        expect(query.select.organization.select).not.toHaveProperty('stripeCustomerId');
        expect(query.select.organization.select).not.toHaveProperty('stripeSubscriptionId');
    });
});

describe('PATCH /api/accounts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authMock.mockResolvedValue({ user: { currentOrganizationId: 'org-1' } });
        findFirstMock.mockResolvedValue({ id: 'account-1' });
        updateMock.mockResolvedValue({
            id: 'account-1',
            organizationId: 'org-1',
            organization: { id: 'org-1', name: 'Workspace', logo: null },
        });
    });

    it('returns only safe grouping fields', async () => {
        const request = new Request('http://localhost/api/accounts', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ accountId: 'account-1', organizationId: 'org-1' }),
        });

        await PATCH(request as never);

        const query = updateMock.mock.calls[0][0];
        expect(query).not.toHaveProperty('include');
        expect(query.select).toEqual({
            id: true,
            organizationId: true,
            organization: {
                select: { id: true, name: true, logo: true },
            },
        });
        expect(query.select).not.toHaveProperty('accessToken');
        expect(query.select).not.toHaveProperty('refreshToken');
    });
});
