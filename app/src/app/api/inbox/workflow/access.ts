import { Prisma } from '@/generated/prisma/client';
import { InboxError } from './service';

/** Read current membership/permissions in the same transaction as private data. */
export async function collaborationAccess(tx: Prisma.TransactionClient, organizationId: string, userId: string, write = false) {
    const member = await tx.organizationMember.findFirst({
        where: { organizationId, userId },
        include: { user: { select: { name: true } }, customRole: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!member) throw new InboxError('Organization membership required', 403);
    const canWrite = ['OWNER', 'ADMIN', 'MEMBER'].includes(member.role)
        || (member.role === 'CUSTOM' && member.customRole?.organizationId === organizationId
            && member.customRole.permissions.some(({ permission }) => permission.code === 'posts.edit'));
    if (write && !canWrite) throw new InboxError('Inbox write permission required', 403);
    return { canWrite: Boolean(canWrite), actor: { id: userId, name: member.user?.name || 'Teammate' } };
}
