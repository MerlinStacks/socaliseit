/** Durable TikTok confirmation shared by cleanup and native-post import. */
import { db } from '@/lib/db';
import { checkPublishStatus } from '@/lib/platform-api/tiktok-api';
import type { Post } from '@/generated/prisma/client';

export const tiktokPendingWhere = {
    platform: 'TIKTOK' as const,
    OR: [
        { platformPostId: { startsWith: 'tiktok_pending:' } },
        { platformPostId: null, externalId: { startsWith: 'tiktok_pending:' } },
    ],
};

export type PendingTikTokPost = Pick<Post,
    'id' | 'organizationId' | 'socialAccountId' | 'platformPostId' | 'externalId' |
    'status' | 'updatedAt' | 'publishedAt'>;

export function pendingTikTokId(post: Pick<PendingTikTokPost, 'platformPostId' | 'externalId'>) {
    const marker = post.platformPostId ?? post.externalId;
    return marker?.startsWith('tiktok_pending:') ? marker.slice('tiktok_pending:'.length) : undefined;
}

/** Unknown outcomes remain recoverable. Only TikTok's FAILED permits a retry. */
export async function reconcileTikTokPost(post: PendingTikTokPost, accessToken: string) {
    const publishId = pendingTikTokId(post);
    if (!publishId) return 'unknown';
    const result = await checkPublishStatus(accessToken, publishId).catch(() => null);
    if (!result?.success) return 'unknown';
    if (result.data?.status === 'FAILED') return 'failed';
    if (result.data?.status !== 'PUBLISH_COMPLETE') return 'pending';

    const publicId = result.data.publiclyAvailablePostId?.find(id => /^\d+$/.test(id));
    // Serializable + snapshot predicate: neither a concurrent import nor a publisher
    // can be silently overwritten. A conflict is retried by the next sync/cleanup.
    const changed = await db.$transaction(async tx => {
        const owner = publicId ? await tx.post.findFirst({
            where: { organizationId: post.organizationId, externalId: publicId, id: { not: post.id } },
            select: { id: true },
        }) : null;
        // Keep existing imported records and their relations intact. The native row
        // can still carry the authoritative platform ID without stealing a unique key.
        return tx.post.updateMany({
            where: {
                id: post.id, organizationId: post.organizationId, socialAccountId: post.socialAccountId,
                platform: 'TIKTOK', status: post.status, updatedAt: post.updatedAt,
                platformPostId: post.platformPostId, externalId: post.externalId,
            },
            data: {
                status: 'PUBLISHED', publishedAt: post.publishedAt ?? new Date(),
                platformPostId: publicId ?? `tiktok_pending:${publishId}`,
                externalId: publicId && !owner ? publicId : post.externalId,
            },
        });
    }, { isolationLevel: 'Serializable' });
    return changed.count === 0 ? 'unknown' : publicId ? 'resolved' : 'completed';
}
