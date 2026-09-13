import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@/generated/prisma/client';
import { serializeWorkflow, updateWorkflow, workflowItemSchema } from '../workflow/service';
import { inboxQuerySchema } from '../query';

const now = new Date('2026-09-12T12:00:00Z');
const input = { id: 'message', type: 'dm' as const, socialAccountId: 'account', status: 'resolved' as const };
const tx = {
    directMessage: { findFirst: vi.fn() }, comment: { findFirst: vi.fn() },
    mention: { findFirst: vi.fn() }, review: { findFirst: vi.fn() },
    organizationMember: { findFirst: vi.fn() }, inboxLabel: { count: vi.fn() },
    inboxWorkflow: { findUnique: vi.fn(), upsert: vi.fn() },
};
const client = tx as unknown as Prisma.TransactionClient;
beforeEach(() => {
    vi.resetAllMocks();
    tx.directMessage.findFirst.mockResolvedValue({ id: 'message', conversationId: 'thread', assignedToId: null, labelIds: [] });
    tx.inboxWorkflow.findUnique.mockResolvedValue(null);
    tx.inboxWorkflow.upsert.mockImplementation(async ({ create, update }) => ({ ...create, ...update }));
});

describe('persistent inbox workflow', () => {
    it('derives the DM key from the owned row and never changes read state', async () => {
        await updateWorkflow(client, 'org', input, now);
        expect(tx.directMessage.findFirst).toHaveBeenCalledWith({ where: {
            id: 'message', organizationId: 'org', socialAccountId: 'account', socialAccount: { organizationId: 'org' },
        } });
        expect(tx.inboxWorkflow.upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: { organizationId_type_entityId_socialAccountId: {
                organizationId: 'org', socialAccountId: 'account', type: 'DM', entityId: 'thread',
            } },
            update: expect.objectContaining({ status: 'RESOLVED', snoozedUntil: null }),
        }));
        expect(tx.inboxWorkflow.upsert.mock.calls[0][0].update).not.toHaveProperty('isRead');
    });

    it('rejects missing/foreign entities before writing', async () => {
        tx.directMessage.findFirst.mockResolvedValue(null);
        await expect(updateWorkflow(client, 'org', input, now)).rejects.toMatchObject({ status: 404 });
        expect(tx.inboxWorkflow.upsert).not.toHaveBeenCalled();
    });

    it('rejects assignees and labels outside the organization', async () => {
        tx.organizationMember.findFirst.mockResolvedValue(null);
        await expect(updateWorkflow(client, 'org', { ...input, assignedToId: 'foreign' }, now)).rejects.toThrow('organization member');
        tx.inboxLabel.count.mockResolvedValue(0);
        await expect(updateWorkflow(client, 'org', { ...input, labelIds: ['foreign'] }, now)).rejects.toThrow('Labels');
        expect(tx.inboxWorkflow.upsert).not.toHaveBeenCalled();
    });

    it('validates and deduplicates labels, and permits explicit unassignment', async () => {
        tx.inboxLabel.count.mockResolvedValue(1);
        await updateWorkflow(client, 'org', { ...input, labelIds: ['label', 'label'], assignedToId: null }, now);
        expect(tx.inboxLabel.count).toHaveBeenCalledWith({ where: { organizationId: 'org', id: { in: ['label'] } } });
        expect(tx.inboxWorkflow.upsert.mock.calls[0][0].update).toMatchObject({ labelIds: ['label'], assignedToId: null });
    });

    it('requires a future deadline and clears it on resolution', async () => {
        for (const snoozedUntil of [undefined, null, now.toISOString()]) {
            await expect(updateWorkflow(client, 'org', { ...input, status: 'snoozed', snoozedUntil }, now)).rejects.toThrow('future');
        }
        tx.inboxWorkflow.findUnique.mockResolvedValue({ status: 'SNOOZED', snoozedUntil: new Date('2026-09-13T12:00:00Z'), assignedToId: 'member', labelIds: ['label'] });
        await updateWorkflow(client, 'org', input, now);
        expect(tx.inboxWorkflow.upsert.mock.calls[0][0].update).toMatchObject({ status: 'RESOLVED', snoozedUntil: null });
    });

    it('expired snoozes reopen without losing assignment or labels', () => {
        expect(serializeWorkflow({ status: 'SNOOZED', snoozedUntil: now, assignedToId: 'member', labelIds: ['label'] }, now))
            .toEqual({ status: 'open', snoozedUntil: null, assignedToId: 'member', labelIds: ['label'] });
    });

    it('rejects unsupported mutations and malformed query filters', () => {
        expect(workflowItemSchema.safeParse({ ...input, conversationId: 'spoof' }).success).toBe(false);
        expect(workflowItemSchema.safeParse({ id: 'x', type: 'review', socialAccountId: 'a' }).success).toBe(false);
        for (const query of [{ page: '0' }, { page: '1.5' }, { type: 'invalid' }, { queue: 'invalid' }, { platform: 'invalid' }, { startDate: 'oops' }]) {
            expect(inboxQuerySchema.safeParse(query).success).toBe(false);
        }
    });
});
