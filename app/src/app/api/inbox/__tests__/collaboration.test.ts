// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Prisma } from '@/generated/prisma/client';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), transaction: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/db', () => ({ db: { $transaction: mocks.transaction } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
import { GET, POST } from '../collaboration/route';
import { updateWorkflow } from '../workflow/service';
import { PATCH } from '../workflow/route';
import { cursorScope, historyPage } from '../collaboration/pagination';

const tx = {
    organizationMember: { findFirst: vi.fn(), findMany: vi.fn() },
    directMessage: { findFirst: vi.fn() }, comment: { findFirst: vi.fn() }, mention: { findFirst: vi.fn() }, review: { findFirst: vi.fn() },
    inboxWorkflow: { findUnique: vi.fn(), upsert: vi.fn() }, inboxLabel: { count: vi.fn() },
    inboxNote: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    inboxActivity: { findMany: vi.fn(), create: vi.fn(), createMany: vi.fn() }, notification: { createMany: vi.fn() },
};
const input = { id: 'local&message', type: 'dm' as const, socialAccountId: 'account', body: 'private secret',
    mentionIds: ['recipient', 'recipient'], requestId: '7a7b8172-1de8-4f73-9a80-555de4a025a3' };
const post = (body: unknown = input) => POST(new NextRequest('http://localhost/api/inbox/collaboration', { method: 'POST', body: JSON.stringify(body) }));
const get = (params = {}) => GET(new NextRequest(`http://localhost/api/inbox/collaboration?${new URLSearchParams({ id: input.id, type: input.type, socialAccountId: input.socialAccountId, ...params })}`));
beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'author', currentOrganizationId: 'org' } });
    mocks.transaction.mockImplementation(async (fn) => fn(tx));
    tx.organizationMember.findFirst.mockResolvedValue({ role: 'MEMBER', user: { name: 'Author' } });
    tx.organizationMember.findMany.mockResolvedValue([{ userId: 'recipient', user: { name: 'Recipient' } }]);
    tx.directMessage.findFirst.mockResolvedValue({ id: input.id, conversationId: 'thread', assignedToId: null, labelIds: [] });
    tx.inboxWorkflow.findUnique.mockResolvedValue({ id: 'workflow', status: 'OPEN', snoozedUntil: null, assignedToId: null, labelIds: [] });
    tx.inboxWorkflow.upsert.mockImplementation(async ({ create, update }) => ({ id: 'workflow', ...create, ...update }));
    tx.inboxNote.findUnique.mockResolvedValue(null);
    tx.inboxNote.create.mockImplementation(async ({ data }) => ({ id: 'note', createdAt: new Date('2026-09-13'), ...data }));
    tx.inboxNote.findMany.mockResolvedValue([]);
    tx.inboxActivity.findMany.mockResolvedValue([]);
});

describe('private inbox collaboration', () => {
    it('requires authenticated live membership for reads and writes', async () => {
        mocks.auth.mockResolvedValue(null);
        expect((await get()).status).toBe(401);
        expect((await post()).status).toBe(401);
        mocks.auth.mockResolvedValue({ user: { id: 'author', currentOrganizationId: 'org' } });
        tx.organizationMember.findFirst.mockResolvedValue(null);
        expect((await get()).status).toBe(403);
        expect((await post()).status).toBe(403);
        expect(tx.directMessage.findFirst).not.toHaveBeenCalled();
    });
    it('VIEWER can read bounded history but cannot write notes or workflows', async () => {
        tx.organizationMember.findFirst.mockResolvedValue({ role: 'VIEWER' });
        expect(await (await get()).json()).toEqual({ data: { notes: [], activity: [], canWrite: false,
            pagination: { notes: { nextCursor: null }, activity: { nextCursor: null } } } });
        expect(tx.inboxNote.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 51, where: { organizationId: 'org', workflowId: 'workflow' } }));
        expect(tx.inboxActivity.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 51 }));
        expect((await post()).status).toBe(403);
        expect((await PATCH(new NextRequest('http://localhost/api/inbox/workflow', { method: 'PATCH', body: JSON.stringify({ id: input.id, type: 'dm', socialAccountId: 'account', status: 'resolved' }) }))).status).toBe(403);
    });
    it('CUSTOM is fail-closed and uses same-tenant posts.edit', async () => {
        for (const [organizationId, code, status] of [['org', 'team.view', 403], ['foreign', 'posts.edit', 403], ['org', 'posts.edit', 200]] as const) {
            tx.organizationMember.findFirst.mockResolvedValue({ role: 'CUSTOM', customRole: { organizationId, permissions: [{ permission: { code } }] } });
            expect((await post()).status).toBe(status);
        }
    });
    it('returns independent cursors inside data and applies only the requested stream position', async () => {
        const rows = Array.from({ length: 51 }, (_, i) => ({ id: `note-${100 - i}`, body: 'private', authorId: 'author',
            authorName: 'Author', mentions: [], createdAt: new Date('2026-09-13') }));
        tx.inboxNote.findMany.mockResolvedValue(rows);
        const first = await (await get()).json();
        expect(first.data.notes).toHaveLength(50);
        expect(first.data.notes[0].createdAt).toBe('2026-09-13T00:00:00.000Z');
        expect(first.data.pagination.activity.nextCursor).toBeNull();
        const noteCursor = first.data.pagination.notes.nextCursor;
        expect(typeof noteCursor).toBe('string');
        tx.inboxNote.findMany.mockResolvedValue([rows[50]]);
        const second = await (await get({ noteCursor })).json();
        expect(second.data.notes).toHaveLength(1);
        expect(second.data.pagination.notes.nextCursor).toBeNull();
        expect(tx.inboxNote.findMany.mock.lastCall?.[0]).toEqual({ take: 51,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], where: { organizationId: 'org', workflowId: 'workflow',
                OR: [{ createdAt: { lt: rows[49].createdAt } }, { createdAt: rows[49].createdAt, id: { lt: rows[49].id } }] } });
        expect(tx.inboxActivity.findMany.mock.lastCall?.[0].where).toEqual({ organizationId: 'org', workflowId: 'workflow' });
        expect((await get({ activityCursor: noteCursor })).status).toBe(400);
    });
    it('rejects malformed, cross-tenant/account/entity cursors and includes pagination without a workflow', async () => {
        const key = { organizationId: 'org', socialAccountId: 'account', type: 'DM', entityId: 'thread' };
        const rows = Array.from({ length: 51 }, (_, i) => ({ id: String(i), createdAt: new Date('2026-09-13') }));
        for (const changed of [{ organizationId: 'foreign' }, { socialAccountId: 'foreign' }, { entityId: 'other' }]) {
            const noteCursor = historyPage(rows, cursorScope({ ...key, ...changed }, 'notes')).nextCursor!;
            expect((await get({ noteCursor })).status).toBe(400);
        }
        for (const noteCursor of ['', '!', 'a'.repeat(2049), Buffer.from('{}').toString('base64url')]) {
            expect((await get({ noteCursor })).status).toBe(400);
        }
        expect(tx.inboxNote.findMany).not.toHaveBeenCalled();
        tx.inboxWorkflow.findUnique.mockResolvedValue(null);
        expect((await (await get()).json()).data.pagination).toEqual({ notes: { nextCursor: null }, activity: { nextCursor: null } });
    });
    it('advances both streams independently with their own tie-break positions', async () => {
        const key = { organizationId: 'org', socialAccountId: 'account', type: 'DM', entityId: 'thread' };
        const notes = Array.from({ length: 51 }, (_, i) => ({ id: `n${100 - i}`, createdAt: new Date('2026-09-12') }));
        const activity = Array.from({ length: 51 }, (_, i) => ({ id: `a${100 - i}`, createdAt: new Date('2026-09-13') }));
        const noteCursor = historyPage(notes, cursorScope(key, 'notes')).nextCursor!;
        const activityCursor = historyPage(activity, cursorScope(key, 'activity')).nextCursor!;
        expect((await get({ noteCursor, activityCursor })).status).toBe(200);
        expect(tx.inboxNote.findMany.mock.lastCall?.[0].where.OR[1]).toEqual({ createdAt: notes[49].createdAt, id: { lt: notes[49].id } });
        expect(tx.inboxActivity.findMany.mock.lastCall?.[0].where.OR[1]).toEqual({ createdAt: activity[49].createdAt, id: { lt: activity[49].id } });
    });
    it('rejects unowned local rows/accounts on both reads and writes', async () => {
        tx.directMessage.findFirst.mockResolvedValue(null);
        expect((await get()).status).toBe(404);
        expect((await post()).status).toBe(404);
        expect(tx.directMessage.findFirst).toHaveBeenCalledWith({ where: { id: input.id, organizationId: 'org', socialAccountId: 'account', socialAccount: { organizationId: 'org' } } });
        expect(tx.inboxNote.create).not.toHaveBeenCalled();
    });
    it('rejects invalid/removed mention users without note or notification effects', async () => {
        tx.organizationMember.findMany.mockResolvedValue([]);
        expect((await post()).status).toBe(400);
        expect(tx.inboxNote.create).not.toHaveBeenCalled();
        expect(tx.notification.createMany).not.toHaveBeenCalled();
    });
    it('atomically appends deduplicated mentions, safe notifications and history using the canonical DM key', async () => {
        const response = await post();
        expect(response.status).toBe(200);
        expect((await response.json()).data.mentions).toEqual([{ id: 'recipient', name: 'Recipient' }]);
        expect(tx.inboxWorkflow.upsert.mock.calls[0][0].create).toMatchObject({ entityId: 'thread', socialAccountId: 'account', organizationId: 'org', type: 'DM' });
        const notifications = tx.notification.createMany.mock.calls[0][0].data;
        expect(notifications).toHaveLength(1);
        expect(notifications[0]).toMatchObject({ userId: 'recipient', organizationId: 'org' });
        expect(JSON.stringify(notifications)).not.toContain(input.body);
        const link = new URL(notifications[0].link, 'http://localhost');
        expect(link.pathname).toBe('/engagement');
        expect(link.searchParams.get('itemId')).toBe(input.id);
        expect(tx.inboxActivity.create).toHaveBeenCalledOnce();
        expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable', timeout: 15000 });
    });
    it('retries return the original note without duplicated effects', async () => {
        await post();
        const note = await tx.inboxNote.create.mock.results[0].value;
        tx.inboxNote.findUnique.mockResolvedValue(note);
        expect((await post({ ...input, body: 'changed', mentionIds: ['removed'] })).status).toBe(200);
        expect(tx.inboxNote.create).toHaveBeenCalledOnce();
        expect(tx.notification.createMany).toHaveBeenCalledOnce();
        expect(tx.inboxActivity.create).toHaveBeenCalledOnce();
        expect(tx.inboxNote.findUnique).toHaveBeenCalledWith({ where: { workflowId_authorId_requestId: { workflowId: 'workflow', authorId: 'author', requestId: input.requestId } } });
    });
    it('retries serialization conflicts and propagates notification failure for rollback', async () => {
        mocks.transaction.mockRejectedValueOnce({ code: 'P2034' });
        expect((await post()).status).toBe(200);
        tx.notification.createMany.mockRejectedValue(new Error('database unavailable'));
        expect((await post()).status).toBe(500);
        await expect(mocks.transaction.mock.results[2].value).rejects.toThrow('database unavailable');
    });
    it('validates body, UUID and mention limits', async () => {
        for (const invalid of [{ body: ' ' }, { body: 'x'.repeat(5001) }, { mentionIds: Array(21).fill('recipient') }, { requestId: 'bad' }]) {
            expect((await post({ ...input, ...invalid })).status).toBe(400);
        }
        expect(mocks.transaction).not.toHaveBeenCalled();
    });
    it('logs actual workflow changes once and ignores no-op/reordered labels', async () => {
        const existing = { id: 'workflow', status: 'OPEN', snoozedUntil: null, assignedToId: null, labelIds: ['a', 'b'] };
        tx.inboxWorkflow.findUnique.mockResolvedValue(existing);
        tx.inboxWorkflow.upsert.mockImplementation(async ({ update }) => ({ ...existing, ...Object.fromEntries(Object.entries(update).filter(([, v]) => v !== undefined)) }));
        tx.inboxLabel.count.mockResolvedValue(2);
        const item = { id: input.id, type: input.type, socialAccountId: input.socialAccountId };
        const actor = { id: 'author', name: 'Author' };
        await updateWorkflow(tx as unknown as Prisma.TransactionClient, 'org', { ...item, status: 'open', labelIds: ['b', 'a'] }, new Date(), actor);
        expect(tx.inboxActivity.createMany).not.toHaveBeenCalled();
        tx.inboxLabel.count.mockResolvedValue(0);
        await updateWorkflow(tx as unknown as Prisma.TransactionClient, 'org', { ...item, status: 'resolved', assignedToId: 'recipient', labelIds: [] }, new Date(), actor);
        expect(tx.inboxActivity.createMany.mock.calls[0][0].data.map((a: { kind: string }) => a.kind)).toEqual(['status', 'assignment', 'labels']);
    });
    it('documents why historical resolution activity cannot distinguish initial writes from known-state transitions', async () => {
        tx.inboxWorkflow.upsert.mockImplementation(async ({ create, update }) => ({ id: 'workflow', ...create,
            ...Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined)) }));
        const item = { id: input.id, type: input.type, socialAccountId: input.socialAccountId, status: 'resolved' as const };
        const actor = { id: 'author', name: 'Author' };
        await updateWorkflow(tx as unknown as Prisma.TransactionClient, 'org', item, new Date(), actor);
        const knownTransition = tx.inboxActivity.createMany.mock.calls[0][0].data;
        tx.inboxWorkflow.findUnique.mockResolvedValue(null);
        await updateWorkflow(tx as unknown as Prisma.TransactionClient, 'org', item, new Date(), actor);
        expect(tx.inboxActivity.createMany.mock.calls[1][0].data).toEqual(knownTransition);
        expect(knownTransition[0]).toMatchObject({ kind: 'status', description: 'Status changed to resolved' });
        tx.inboxWorkflow.findUnique.mockResolvedValue({ id: 'workflow', status: 'RESOLVED', snoozedUntil: null, assignedToId: null, labelIds: [] });
        await updateWorkflow(tx as unknown as Prisma.TransactionClient, 'org', item, new Date(), actor);
        expect(tx.inboxActivity.createMany).toHaveBeenCalledTimes(2);
    });
});
