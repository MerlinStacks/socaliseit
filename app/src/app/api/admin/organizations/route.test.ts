// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { findUnique, findMany, count, create, requireSuperAdmin } = vi.hoisted(() => ({
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    requireSuperAdmin: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: { organization: { findUnique, findMany, count, create } } }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/admin/middleware', () => ({
    withSuperAdmin: (handler: (...args: unknown[]) => Promise<Response>) => async (request: NextRequest) => {
        const result = await requireSuperAdmin();
        if (!result.success) return result.response;
        return handler(request, result.admin);
    },
}));

import { GET, POST } from './route';

function request(body: unknown) {
    return new NextRequest('http://localhost/api/admin/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('POST /api/admin/organizations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        requireSuperAdmin.mockResolvedValue({ success: true, admin: { userId: 'admin' } });
        findUnique.mockResolvedValue(null);
        create.mockImplementation(async ({ data }) => ({ id: 'org-1', ...data }));
    });

    it.each(['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE', 'ADMIN'])('creates an organization with the %s tier', async (tier) => {
        const data = { name: 'Gift This', slug: 'gift-this', tier, maxMembers: 5 };
        const response = await POST(request(data));

        expect(response.status).toBe(201);
        expect(create).toHaveBeenCalledWith({ data });
        expect((await response.json()).organization.tier).toBe(tier);
    });

    it('preserves defaults when optional settings are omitted', async () => {
        const response = await POST(request({ name: 'Gift This', slug: 'gift-this' }));

        expect(response.status).toBe(201);
        expect(create).toHaveBeenCalledWith({ data: {
            name: 'Gift This', slug: 'gift-this', tier: 'FREE', maxMembers: 5,
        } });
    });

    it.each([{ tier: 'INVALID' }, { maxMembers: 1.5 }, { maxMembers: 0 }])('returns an actionable validation error for %j', async (invalid) => {
        const response = await POST(request({ name: 'Gift This', slug: 'gift-this', ...invalid }));
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.message).toContain(Object.keys(invalid)[0]);
        expect(create).not.toHaveBeenCalled();
    });

    it('rejects duplicate slugs', async () => {
        findUnique.mockResolvedValue({ id: 'existing' });
        const response = await POST(request({ name: 'Gift This', slug: 'gift-this', tier: 'ADMIN' }));

        expect(response.status).toBe(409);
        expect((await response.json()).message).toBe('Organization slug already exists');
        expect(create).not.toHaveBeenCalled();
    });

    it('filters organizations by the ADMIN tier', async () => {
        findMany.mockResolvedValue([]);
        count.mockResolvedValue(0);
        const response = await GET(new NextRequest('http://localhost/api/admin/organizations?tier=ADMIN'));

        expect(response.status).toBe(200);
        expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tier: 'ADMIN' } }));
        expect(count).toHaveBeenCalledWith({ where: { tier: 'ADMIN' } });
    });
});
