import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { createPosts, type CreatePostParams } from '@/lib/post-creation';
import type { Prisma } from '@/generated/prisma/client';
import type { PlatformSettingsInput } from '@/types/platform-settings';

/** Stable even when a queue template is deleted while an interrupted batch is resumed. */
export function placementPostId(rowId: string, accountId: string) {
    return `bulk-${crypto.createHash('sha256').update(JSON.stringify([rowId, accountId])).digest('hex')}`;
}

export async function createQueueDraft(tx: Prisma.TransactionClient, input: CreatePostParams, postId: string) {
    const ids = [...new Set(input.mediaIds ?? [])];
    if (ids.length && (await tx.media.count({ where: { id: { in: ids }, organizationId: input.organizationId } })) !== ids.length) {
        throw new Error('Required media was removed or is not in this workspace');
    }
    const result = await createPosts({ ...input, autoPublish: false, scheduledAt: null }, { transaction: tx, postId, validateForAutoPublish: true });
    if (result.error || result.posts?.length !== 1) throw new Error(result.error || 'Draft creation failed');
    return result.posts[0].id;
}

/** Preserve the actual composer metadata rather than rebuilding a partial Post row. */
export async function cloneQueueDraft(organizationId: string, postId: string, accountId: string, userId: string) {
    return db.$transaction(async tx => {
        const source = await tx.post.findFirst({ where: { id: postId, organizationId }, include: { media: { orderBy: { order: 'asc' } }, hashtags: { include: { hashtag: true } }, productTags: true } });
        if (!source) throw new Error('Post not found');
        const settings = Object.fromEntries(Object.entries(source).filter(([key, value]) => CLONE_FIELDS.has(key) && value !== null)) as PlatformSettingsInput;
        settings.customThumbnails = Object.fromEntries(source.media.filter(m => m.customThumbnailUrl).map(m => [m.mediaId, m.customThumbnailUrl!]));
        settings.productTags = source.productTags.map(tag => ({ platformProductId: tag.platformProductId, productName: tag.productName, mediaIndex: tag.mediaIndex, positionX: tag.positionX ?? undefined, positionY: tag.positionY ?? undefined }));
        const id = await createQueueDraft(tx, {
            organizationId, userId, userName: 'Member (via publishing queue)',
            caption: source.caption, platformAccountIds: [accountId], mediaIds: source.media.map(m => m.mediaId),
            hashtags: source.hashtags.map(h => h.hashtag.tag), pillarId: source.pillarId,
            platformSettings: { [accountId]: settings },
        }, crypto.randomUUID());
        const group = source.linkedGroupId || source.id;
        await tx.post.updateMany({ where: { id: { in: [source.id, id] }, organizationId }, data: { linkedGroupId: group } });
        return id;
    });
}

const CLONE_FIELDS: ReadonlySet<string> = new Set<keyof PlatformSettingsInput>([
    'postType', 'firstComment', 'callToAction', 'pinTitle', 'pinLink', 'boardId', 'location', 'videoTitle', 'youtubeCategory', 'youtubePlaylist',
    'videoTags', 'createFirstLike', 'embeddable', 'notifySubscribers', 'madeForKids', 'youtubePrivacy', 'youtubeCommentsEnabled',
    'linkedinVisibility', 'tiktokPrivacyLevel', 'tiktokContentDisclosure', 'tiktokBrandOrganic', 'tiktokBrandContent', 'tiktokIsAigc',
    'tiktokComments', 'tiktokDuets', 'tiktokStitches', 'threadsTopicTag', 'threadsQuotePostId', 'instagramShareToFeed',
    'instagramComments', 'isTrialReel', 'altText', 'userTags', 'subtitleTracks', 'notifyDeviceIds',
]);
