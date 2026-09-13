import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), transaction: vi.fn(), member: vi.fn(), accounts: vi.fn(), members: vi.fn(), labels: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/db', () => ({ db: { $transaction: mocks.transaction,
    socialAccount: { findMany: mocks.accounts }, organizationMember: { findMany: mocks.members }, inboxLabel: { findMany: mocks.labels },
} }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('../workflow/service', async (original) => ({ ...await original<typeof import('../workflow/service')>(), updateWorkflow: mocks.update }));
import { PATCH } from '../workflow/route';
import { GET } from '../options/route';
import { InboxError } from '../workflow/service';

const item = { id: 'review', type: 'review', socialAccountId: 'account', status: 'resolved' };
const request = (body: unknown) => new NextRequest('http://localhost/api/inbox/workflow', { method: 'PATCH', body: JSON.stringify(body) });
beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'user', currentOrganizationId: 'org' } });
    mocks.member.mockResolvedValue({ id: 'membership', role: 'MEMBER', user: { name: 'Member' } });
    mocks.transaction.mockImplementation(async (callback) => callback({ organizationMember: { findFirst: mocks.member } }));
    mocks.update.mockResolvedValue({ ...item, workflow: { status: 'resolved', snoozedUntil: null, assignedToId: null, labelIds: [] } });
});
describe('workflow and options routes', () => {
    it('requires authentication and current organization membership for mutation', async () => {
        mocks.auth.mockResolvedValueOnce(null);
        expect((await PATCH(request(item))).status).toBe(401);
        mocks.member.mockResolvedValueOnce(null);
        expect((await PATCH(request(item))).status).toBe(403);
        expect(mocks.update).not.toHaveBeenCalled();
    });
    it('accepts single and bulk contract shapes inside a serializable transaction', async () => {
        const single = await (await PATCH(request(item))).json();
        expect(single.data.workflow.status).toBe('resolved');
        const bulk = await (await PATCH(request({ items: [item, { ...item, id: 'second' }] }))).json();
        expect(bulk.data).toHaveLength(2);
        expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable', timeout: 15000 });
    });
    it('propagates a bulk item failure out of the transaction for rollback', async () => {
        mocks.update.mockResolvedValueOnce({}).mockRejectedValueOnce(new InboxError('Item not found', 404));
        const response = await PATCH(request({ items: [item, { ...item, id: 'foreign' }] }));
        expect(response.status).toBe(404);
        await expect(mocks.transaction.mock.results[0].value).rejects.toMatchObject({ status: 404 });
    });
    it('rejects empty/oversized bulk requests and reports write conflicts', async () => {
        expect((await PATCH(request({ items: [] }))).status).toBe(400);
        expect((await PATCH(request({ items: Array(101).fill(item) }))).status).toBe(400);
        mocks.transaction.mockRejectedValueOnce({ code: 'P2034' });
        expect((await PATCH(request(item))).status).toBe(409);
    });
    it('returns organization-scoped options with user IDs rather than membership IDs', async () => {
        mocks.accounts.mockResolvedValue([{ id: 'account', name: 'Page', platform: 'FACEBOOK' }]);
        mocks.members.mockResolvedValue([{ user: { id: 'user', name: null } }]);
        mocks.labels.mockResolvedValue([{ id: 'label', name: 'Urgent', color: '#ff0000' }]);
        const data = await (await GET()).json();
        expect(data).toEqual({ accounts: [{ id: 'account', name: 'Page', platform: 'FACEBOOK' }],
            members: [{ id: 'user', name: 'Unnamed member' }], labels: [{ id: 'label', name: 'Urgent', color: '#ff0000' }] });
        for (const lookup of [mocks.accounts, mocks.members, mocks.labels]) {
            expect(lookup.mock.calls[0][0].where).toEqual({ organizationId: 'org' });
        }
    });
});
