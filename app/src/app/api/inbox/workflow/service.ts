import { z } from 'zod';
import { Prisma, InboxEntityType } from '@/generated/prisma/client';

export const workflowItemSchema = z.object({
    id: z.string().min(1),
    type: z.enum(['comment', 'mention', 'dm', 'review']),
    socialAccountId: z.string().min(1),
    status: z.enum(['open', 'resolved', 'snoozed']).optional(),
    snoozedUntil: z.string().datetime({ offset: true }).nullable().optional(),
    assignedToId: z.string().min(1).nullable().optional(),
    labelIds: z.array(z.string().min(1)).max(100).optional(),
}).strict().refine((v) => v.status !== undefined || v.snoozedUntil !== undefined
    || v.assignedToId !== undefined || v.labelIds !== undefined, 'No workflow changes supplied');

export class InboxError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}

export function serializeWorkflow(value: {
    status: string; snoozedUntil: Date | null; assignedToId: string | null; labelIds: string[];
}, now = new Date()) {
    const expired = value.status === 'SNOOZED' && value.snoozedUntil !== null && value.snoozedUntil <= now;
    return {
        status: (expired ? 'open' : value.status.toLowerCase()) as 'open' | 'resolved' | 'snoozed',
        snoozedUntil: expired ? null : value.snoozedUntil?.toISOString() ?? null,
        assignedToId: value.assignedToId,
        labelIds: value.labelIds,
    };
}

/** Resolve only owned local rows; never accept a caller-supplied conversation key. */
export async function resolveWorkflowItem(tx: Prisma.TransactionClient, organizationId: string,
    input: { id: string; type: 'comment' | 'mention' | 'dm' | 'review'; socialAccountId: string }) {
    const where = { id: input.id, organizationId, socialAccountId: input.socialAccountId,
        socialAccount: { organizationId } };
    const entity = input.type === 'comment' ? await tx.comment.findFirst({ where })
        : input.type === 'mention' ? await tx.mention.findFirst({ where })
            : input.type === 'review' ? await tx.review.findFirst({ where })
                : await tx.directMessage.findFirst({ where });
    if (!entity) throw new InboxError('Item not found', 404);
    const key = { organizationId, socialAccountId: input.socialAccountId,
        type: input.type.toUpperCase() as InboxEntityType,
        entityId: 'conversationId' in entity ? entity.conversationId : entity.id };
    return { entity, key };
}

/** All lookups, history and writes share the caller's serializable transaction. */
export async function updateWorkflow(tx: Prisma.TransactionClient, organizationId: string,
    input: z.infer<typeof workflowItemSchema>, now = new Date(), actor?: { id: string; name: string }) {
    const { entity, key } = await resolveWorkflowItem(tx, organizationId, input);
    if (input.assignedToId && !await tx.organizationMember.findFirst({
        where: { organizationId, userId: input.assignedToId }, select: { id: true },
    })) throw new InboxError('Assignee must be an organization member');
    const labelIds = input.labelIds ? [...new Set(input.labelIds)] : undefined;
    if (labelIds && await tx.inboxLabel.count({ where: { organizationId, id: { in: labelIds } } }) !== labelIds.length) {
        throw new InboxError('Labels must belong to the organization');
    }
    const existing = await tx.inboxWorkflow.findUnique({
        where: { organizationId_type_entityId_socialAccountId: key },
    });
    const effective = existing ? serializeWorkflow(existing, now) : null;
    const status = input.status ?? effective?.status ?? 'open';
    const snoozedUntil = input.snoozedUntil !== undefined
        ? input.snoozedUntil ? new Date(input.snoozedUntil) : null
        : effective?.snoozedUntil ? new Date(effective.snoozedUntil) : null;
    if (status === 'snoozed' && (!snoozedUntil || snoozedUntil <= now)) {
        throw new InboxError('Snoozed status requires a future snoozedUntil');
    }
    if (status !== 'snoozed' && input.snoozedUntil) {
        throw new InboxError('snoozedUntil requires snoozed status');
    }
    const data = {
        status: status.toUpperCase() as 'OPEN' | 'RESOLVED' | 'SNOOZED',
        snoozedUntil: status === 'snoozed' ? snoozedUntil : null,
        assignedToId: input.assignedToId,
        labelIds,
    };
    const result = await tx.inboxWorkflow.upsert({
        where: { organizationId_type_entityId_socialAccountId: key },
        create: { ...key, ...data,
            assignedToId: input.assignedToId !== undefined ? input.assignedToId : 'assignedToId' in entity ? entity.assignedToId : null,
            labelIds: labelIds ?? ('labelIds' in entity ? entity.labelIds : []),
        },
        update: data,
    });
    if (actor) {
        const before = effective ?? { status: 'open', snoozedUntil: null,
            assignedToId: 'assignedToId' in entity ? entity.assignedToId : null,
            labelIds: 'labelIds' in entity ? entity.labelIds : [] };
        const after = serializeWorkflow(result, now);
        const changes = [];
        if (before.status !== after.status || before.snoozedUntil !== after.snoozedUntil) {
            changes.push({ kind: 'status', description: `Status changed to ${after.status}${after.snoozedUntil ? ` until ${after.snoozedUntil}` : ''}` });
        }
        if (before.assignedToId !== after.assignedToId) {
            changes.push({ kind: 'assignment', description: after.assignedToId ? `Assignment changed to ${after.assignedToId}` : 'Assignment cleared' });
        }
        if (JSON.stringify([...before.labelIds].sort()) !== JSON.stringify([...after.labelIds].sort())) {
            changes.push({ kind: 'labels', description: `Labels changed (${after.labelIds.length} selected)` });
        }
        if (changes.length) await tx.inboxActivity.createMany({ data: changes.map((change) => ({
            ...change, organizationId, workflowId: result.id, actorId: actor.id, actorName: actor.name,
        })) });
    }
    return { id: input.id, type: input.type, socialAccountId: input.socialAccountId, workflow: serializeWorkflow(result, now) };
}
