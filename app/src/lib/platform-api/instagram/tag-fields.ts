import type { FeedPostPayload } from '../types';

/** Tags belong to their selected carousel child, never every image. Videos omit coordinates. */
export function instagramTagFields(payload: Pick<FeedPostPayload, 'userTags' | 'productTags'>, mediaIndex: number, video = false): Record<string, unknown> {
    const users = payload.userTags?.filter(tag => (tag.mediaIndex ?? 0) === mediaIndex) || [];
    const products = payload.productTags?.filter(tag => tag.mediaIndex === mediaIndex) || [];
    return {
        ...(users.length ? { user_tags: users.map(tag => ({
            username: tag.username,
            ...(!video ? { x: tag.x, y: tag.y } : {}),
        })) } : {}),
        ...(products.length ? { product_tags: products.map(tag => ({
            product_id: tag.platformProductId,
            ...(!video ? { x: tag.positionX ?? 0.5, y: tag.positionY ?? 0.5 } : {}),
        })) } : {}),
    };
}
