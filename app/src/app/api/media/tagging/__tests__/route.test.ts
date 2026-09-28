// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), list: vi.fn(), member: vi.fn(), update: vi.fn(), enqueue: vi.fn(), model: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/db', () => ({ db: { media: { findMany: mocks.list }, organizationMember: { findFirst: mocks.member }, organization: { update: mocks.update } } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/ai/seb-config', () => ({ getSebProviderSettings: vi.fn().mockResolvedValue({ model: 'vision' }) }));
vi.mock('@/lib/ai/openrouter-models', () => ({ getSebModel: mocks.model }));
vi.mock('@/lib/media/tag-queue', () => ({ enqueueMediaTagging: mocks.enqueue }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }), createRateLimitHeaders: vi.fn() }));
import { POST, PATCH } from '../route';
const request = (body: unknown, method = 'POST') => new NextRequest('http://localhost/api/media/tagging', { method, body: JSON.stringify(body) });

describe('media tagging API', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.mockResolvedValue({ user: { id: 'user', currentOrganizationId: 'org-a' } });
        mocks.model.mockResolvedValue({ supportsImageInput: true });
        mocks.member.mockResolvedValue({ role: 'MEMBER' });
        mocks.enqueue.mockResolvedValue(true);
    });
    it('requires authentication', async () => {
        mocks.auth.mockResolvedValue(null);
        expect((await POST(request({ ids: ['m'] }))).status).toBe(401);
        expect(mocks.enqueue).not.toHaveBeenCalled();
    });
    it('rejects cross-workspace media before any jobs are queued', async () => {
        mocks.list.mockResolvedValue([{ id: 'own', mimeType: 'image/jpeg' }]);
        expect((await POST(request({ ids: ['own', 'foreign'] }))).status).toBe(404);
        expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org-a', id: { in: ['own', 'foreign'] } } }));
        expect(mocks.enqueue).not.toHaveBeenCalled();
    });
    it('reports queued, skipped and failed items accurately', async () => {
        mocks.list.mockResolvedValue(['a', 'b', 'c'].map(id => ({ id, mimeType: 'image/jpeg' })));
        mocks.enqueue.mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('queue'));
        const response = await POST(request({ ids: ['a', 'b', 'c'] }));
        expect(response.status).toBe(202);
        expect(await response.json()).toEqual({ queued: 1, failed: 1, skipped: 1 });
    });
    it('requires an admin and strict boolean to update workspace settings', async () => {
        expect((await PATCH(request({ enabled: true }, 'PATCH'))).status).toBe(403);
        mocks.member.mockResolvedValue({ role: 'ADMIN' });
        expect((await PATCH(request({ enabled: 'false' }, 'PATCH'))).status).toBe(400);
        expect(mocks.update).not.toHaveBeenCalled();
        expect((await PATCH(request({ enabled: false }, 'PATCH'))).status).toBe(200);
        expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'org-a' }, data: { mediaAutoTagEnabled: false } });
    });
});
