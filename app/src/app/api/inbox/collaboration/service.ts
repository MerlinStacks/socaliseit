import { z } from 'zod';
import { InboxNote, Prisma } from '@/generated/prisma/client';
import { InboxError, resolveWorkflowItem } from '../workflow/service';

export const collaborationItemSchema = z.object({
    id: z.string().min(1), type: z.enum(['comment', 'mention', 'dm', 'review']), socialAccountId: z.string().min(1),
}).strict();
export const noteSchema = collaborationItemSchema.extend({
    body: z.string().trim().min(1).max(5000),
    mentionIds: z.array(z.string().min(1)).max(20), requestId: z.uuid().transform((id) => id.toLowerCase()),
});

export function serializeNote(note: InboxNote) {
    return { id: note.id, body: note.body, authorId: note.authorId, authorName: note.authorName,
        createdAt: note.createdAt.toISOString(), mentions: note.mentions };
}

export async function appendNote(tx: Prisma.TransactionClient, organizationId: string,
    actor: { id: string; name: string }, input: z.infer<typeof noteSchema>) {
    const { key, entity } = await resolveWorkflowItem(tx, organizationId, input);
    const workflow = await tx.inboxWorkflow.upsert({
        where: { organizationId_type_entityId_socialAccountId: key }, update: {},
        create: { ...key, assignedToId: 'assignedToId' in entity ? entity.assignedToId : null,
            labelIds: 'labelIds' in entity ? entity.labelIds : [] },
    });
    const prior = await tx.inboxNote.findUnique({ where: { workflowId_authorId_requestId: {
        workflowId: workflow.id, authorId: actor.id, requestId: input.requestId,
    } } });
    // A retry returns the original immutable result, even if the submitted body changed.
    if (prior) return serializeNote(prior);
    const mentionIds = [...new Set(input.mentionIds)];
    const members = await tx.organizationMember.findMany({
        where: { organizationId, userId: { in: mentionIds } }, select: { userId: true, user: { select: { name: true } } },
    });
    if (members.length !== mentionIds.length) throw new InboxError('Mentions must be current organization members');
    const mentions = mentionIds.map((id) => ({ id, name: members.find((m) => m.userId === id)?.user.name || 'Teammate' }));
    const note = await tx.inboxNote.create({ data: {
        organizationId, workflowId: workflow.id, authorId: actor.id, authorName: actor.name,
        requestId: input.requestId, body: input.body, mentions,
    } });
    if (mentionIds.length) await tx.notification.createMany({ data: mentionIds.map((userId) => ({
        organizationId, userId, title: 'Mentioned in an inbox note', type: 'info',
        message: 'A teammate mentioned you in an internal inbox note.',
        link: `/engagement?${new URLSearchParams({ itemId: input.id, type: input.type, accountId: input.socialAccountId })}`,
    })) });
    await tx.inboxActivity.create({ data: { organizationId, workflowId: workflow.id,
        actorId: actor.id, actorName: actor.name, kind: 'note', description: 'Added an internal note' } });
    return serializeNote(note);
}
