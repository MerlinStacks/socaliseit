/** Web entry point: creation is worker-safe; Next cache invalidation stays here. */
import { createPosts as createPostRecords } from './post-creation';
import { invalidatePostCaches } from './cache';

export type { CreatePostParams, CreatePostResult, CreatedPostInfo } from './post-creation';

export async function createPosts(...args: Parameters<typeof createPostRecords>) {
    const result = await createPostRecords(...args);
    if (!args[1] && result.posts?.length) invalidatePostCaches(args[0].organizationId);
    return result;
}
