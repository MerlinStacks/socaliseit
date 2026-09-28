/** Durable TikTok confirmation shared by cleanup and native-post import. */
import { db } from '@/lib/db';
import { checkPublishStatus } from '@/lib/platform-api/tiktok-api';
import type { Post } from '@/generated/prisma/client';
import { logger } from '@/lib/logger';
import { acquirePublishLock, releasePublishLock } from '@/lib/publish-lock';

// TikTok FILE_UPLOAD URLs expire after one hour. Use two hours since the last
// post update as a conservative lower bound on the age of an abandoned session.
const EMPTY_UPLOAD_EXPIRY_MS = 2 * 60 * 60 * 1000;

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

/** Unknown outcomes remain recoverable; only failed or expired empty uploads permit a retry. */
export async function reconcileTikTokPost(post: PendingTikTokPost, accessToken: string) {
    const publishId = pendingTikTokId(post);
    if (!publishId) return 'unknown';
    const result = await checkPublishStatus(accessToken, publishId).catch((error: unknown) => ({
        success: false as const,
        error: error instanceof Error ? error.message : 'TikTok status request failed',
        data: undefined,
        errorCode: undefined,
    }));
    const context = {
        postId: post.id,
        organizationId: post.organizationId,
        accountId: post.socialAccountId,
        minutesSinceUpdate: Math.round((Date.now() - post.updatedAt.getTime()) / 60000),
        platformStatus: result.data?.status,
        uploadedBytes: result.data?.uploadedBytes,
        failReason: result.data?.failReason,
    };
    if (!result.success) {
        logger.warn({ ...context, error: result.error, errorCode: result.errorCode }, 'TikTok publish confirmation unavailable');
        return 'unknown';
    }
    if (post.status === 'PUBLISHING' && result.data?.status === 'PROCESSING_UPLOAD'
        && result.data.uploadedBytes === 0
        && Date.now() - post.updatedAt.getTime() >= EMPTY_UPLOAD_EXPIRY_MS) {
        const lockToken = await acquirePublishLock(post.id);
        if (!lockToken) return 'pending';
        try {
            // Never discard an uncertain or partially uploaded session. Claim only
            // the exact snapshot checked above and retain its ID in the error record.
            const expired = await db.$transaction(async tx => {
                const changed = await tx.post.updateMany({
                    where: {
                        id: post.id, organizationId: post.organizationId, socialAccountId: post.socialAccountId,
                        platform: 'TIKTOK', status: 'PUBLISHING', updatedAt: post.updatedAt,
                        platformPostId: post.platformPostId, externalId: post.externalId,
                    },
                    data: {
                        status: 'FAILED',
                        ...(post.platformPostId?.startsWith('tiktok_pending:') && { platformPostId: null }),
                        ...(post.externalId?.startsWith('tiktok_pending:') && { externalId: null }),
                    },
                });
                if (!changed.count) return false;
                await tx.publishError.create({ data: {
                    postId: post.id, platform: 'TIKTOK', errorCode: 'TIKTOK_UPLOAD_EXPIRED',
                    errorRaw: `Expired empty FILE_UPLOAD session: ${publishId}; status=PROCESSING_UPLOAD; uploaded_bytes=0`,
                    errorHuman: 'TikTok received no video bytes before the upload session expired.',
                    suggestion: 'Retry publishing to start a new video upload.',
                } });
                return true;
            }, { isolationLevel: 'Serializable' });
            if (expired) logger.warn(context, 'Expired empty TikTok upload; post can be retried');
            return expired ? 'expired' : 'unknown';
        } finally {
            await releasePublishLock(post.id, lockToken);
        }
    }
    if (result.data?.status !== 'PUBLISH_COMPLETE' && context.minutesSinceUpdate >= 60) {
        logger.warn(context, 'TikTok publish confirmation delayed; check the post in TikTok');
    } else {
        logger.info(context, 'TikTok publish status checked');
    }
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
