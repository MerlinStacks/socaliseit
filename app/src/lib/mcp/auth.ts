import { createHash, randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from '@/lib/auth/permissions';

export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');
export function generatePublishingKey() {
    const key = `osp_${randomBytes(32).toString('hex')}`;
    return { key, keyHash: hashKey(key), keyPrefix: key.slice(0, 12) };
}

/** Recheck membership, bans, and grants on every request, not just at key creation. */
export async function publishingMember(organizationId: string, userId: string) {
    const member = await db.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        include: { user: { select: { name: true, bannedAt: true } },
            customRole: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!member || member.user.bannedAt) return null;
    const permissions = member.role === 'CUSTOM'
        ? (member.customRole?.organizationId === organizationId
            ? member.customRole.permissions.map(p => p.permission.code) : [])
        : DEFAULT_ROLE_PERMISSIONS[member.role];
    return { ...member, permissions };
}

export async function authenticatePublishingKey(request: Request) {
    const header = request.headers.get('authorization');
    if (!header || !/^Bearer osp_[a-f0-9]{64}$/i.test(header)) return null;
    const key = await db.publishingApiKey.findUnique({ where: { keyHash: hashKey(header.slice(7)) } });
    if (!key || key.revokedAt || key.expiresAt <= new Date()) return null;
    const member = await publishingMember(key.organizationId, key.userId);
    if (!member) return null;
    const canPublish = key.scopes.includes('publish')
        && member.permissions.includes(PERMISSIONS.POSTS_CREATE)
        && member.permissions.includes(PERMISSIONS.POSTS_PUBLISH);
    const canRead = key.scopes.includes('read') && member.permissions.includes(PERMISSIONS.ACCOUNTS_VIEW);
    const canReadMedia = key.scopes.includes('read') && member.permissions.includes(PERMISSIONS.MEDIA_VIEW);
    const canUpload = key.scopes.includes('upload') && member.permissions.includes(PERMISSIONS.MEDIA_UPLOAD);
    const canReadAnalytics = key.scopes.includes('read') && member.permissions.includes(PERMISSIONS.ANALYTICS_VIEW);
    if (!canPublish && !canRead && !canReadMedia && !canUpload && !canReadAnalytics) return null;
    return { keyId: key.id, organizationId: key.organizationId, userId: key.userId,
        userName: member.user.name || 'MCP integration', canPublish, canRead, canReadMedia, canUpload, canReadAnalytics };
}

export type PublishingPrincipal = NonNullable<Awaited<ReturnType<typeof authenticatePublishingKey>>>;
