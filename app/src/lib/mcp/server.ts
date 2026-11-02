import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '@/lib/db';
import { createPosts } from '@/lib/posts-service';
import { getPublishingStatus } from '@/lib/publishing-status';
import { logger } from '@/lib/logger';
import { hashKey, type PublishingPrincipal } from './auth';
import { uploadInline, uploadInput, mediaUploadConfig } from './uploads';
import { analyticsInput, analyticsSummary, accountGrowth, topPosts, getPostAnalytics } from './analytics';
import { UploadError } from '@/lib/media/receive-upload';

const id = z.string().min(1).max(100);
// No autoPublish, media overrides, or scheduling fields: they cannot bypass immediate-only publishing.
const settings = z.strictObject({
    postType: z.enum(['FEED', 'REEL', 'STORY', 'CAROUSEL', 'PIN', 'VIDEO', 'ARTICLE', 'THREAD']).optional(),
    pinTitle: z.string().max(100).optional(), pinLink: z.url().max(2048).optional(), boardId: id.optional(),
    videoTitle: z.string().max(100).optional(), youtubeCategory: id.optional(), youtubePlaylist: id.optional(),
    videoTags: z.array(z.string().max(100)).max(100).optional(),
    youtubePrivacy: z.enum(['public', 'private', 'unlisted']).optional(),
    madeForKids: z.boolean().optional(), embeddable: z.boolean().optional(),
    notifySubscribers: z.boolean().optional(), youtubeCommentsEnabled: z.boolean().optional(),
    tiktokPrivacyLevel: z.enum(['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY']).optional(),
    tiktokContentDisclosure: z.boolean().optional(), tiktokBrandOrganic: z.boolean().optional(),
    tiktokBrandContent: z.boolean().optional(), tiktokIsAigc: z.boolean().optional(),
    tiktokComments: z.boolean().optional(), tiktokDuets: z.boolean().optional(), tiktokStitches: z.boolean().optional(),
    instagramShareToFeed: z.boolean().optional(), instagramComments: z.boolean().optional(),
    isTrialReel: z.boolean().optional(), altText: z.string().max(5000).optional(),
    location: z.string().max(1000).optional(), threadsTopicTag: z.string().max(50).optional(),
    threadsQuotePostId: id.optional(), linkedinVisibility: z.enum(['PUBLIC', 'CONNECTIONS']).optional(),
});

export const publishInput = z.strictObject({
    requestId: z.string().uuid().describe('Unique operation UUID. Reuse it with identical input on retries; never change it to retry an uncertain outcome.'),
    accountId: id,
    caption: z.string().max(65_000).default(''),
    mediaIds: z.array(id).max(35).default([]).refine(ids => new Set(ids).size === ids.length, 'Duplicate media IDs'),
    firstComment: z.string().max(10_000).optional(),
    settings: settings.default({}),
});

export function toolResult(value: unknown, isError = false) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], isError };
}

async function safeTool(operation: () => Promise<ReturnType<typeof toolResult>>) {
    try { return await operation(); }
    catch (error) {
        if (error instanceof UploadError) return toolResult({ error: error.message, status: error.status }, true);
        logger.error({ err: error }, 'MCP tool failed');
        return toolResult({ error: 'Operation failed. If publishing was requested, its outcome may be uncertain. Reuse the same requestId; do not submit a new operation blindly.' }, true);
    }
}

/** Normalize object key order so semantically identical retries have the same digest. */
export function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value !== null && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record).filter(key => record[key] !== undefined).sort()
            .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

export async function publishImmediately(principal: PublishingPrincipal, raw: unknown) {
    if (!principal.canPublish) return toolResult({ error: 'Publishing permission required' }, true);
    const input = publishInput.parse(raw);
    const { requestId, ...payload } = input;
    const organizationId = principal.organizationId;
    const where = { organizationId_requestId: { organizationId, requestId } };
    const payloadHash = hashKey(canonicalJson(payload));

    // Atomic unique reservation works across processes and survives restarts/key rotation.
    // Never remove it on error: creation/dispatch might already have succeeded.
    const reservation = await db.publishingRequest.createMany({
        data: [{ organizationId, requestId, payloadHash }], skipDuplicates: true,
    });
    if (!reservation.count) {
        const existing = await db.publishingRequest.findUniqueOrThrow({ where });
        if (existing.payloadHash !== payloadHash) return toolResult({ error: 'requestId already used with different input' }, true);
        if (existing.result) return JSON.parse(existing.result) as ReturnType<typeof toolResult>;
        return toolResult({ requestId, error: 'Request in progress or outcome uncertain. Do not submit with a new requestId. Check the app and platform before taking further action.' }, true);
    }

    const finish = async (result: ReturnType<typeof toolResult>) => {
        await db.publishingRequest.update({ where, data: { result: JSON.stringify(result) } });
        return result;
    };
    const account = await db.socialAccount.findFirst({
        where: { id: input.accountId, organizationId, isActive: true, platform: { not: 'MANUAL' } },
        select: { id: true },
    });
    if (!account) return finish(toolResult({ error: 'Active publishing account not found' }, true));
    const mediaCount = await db.media.count({ where: { id: { in: input.mediaIds }, organizationId } });
    if (mediaCount !== input.mediaIds.length) return finish(toolResult({ error: 'Media not found in this workspace' }, true));

    const result = await createPosts({
        organizationId, userId: principal.userId, userName: principal.userName,
        platformAccountIds: [input.accountId], caption: input.caption, mediaIds: input.mediaIds,
        firstComment: input.firstComment, platformSettings: { [input.accountId]: input.settings },
        autoPublish: true, scheduledAt: null,
    });
    if (result.error) return finish(toolResult({ requestId, error: result.error }, true));
    const postId = result.posts?.[0]?.id;
    if (!postId) throw new Error('Publishing result missing post');
    // The shared service can catch queue failures; re-read instead of claiming success from its stale result.
    const post = await db.post.findFirstOrThrow({ where: { id: postId, organizationId }, select: { status: true, platformPostId: true } });
    const queueFailed = post.status === 'DRAFT';
    const completed = await finish(toolResult({ requestId, postId, status: post.status.toLowerCase(),
        message: queueFailed ? 'Queueing failed. This post is not live; inspect it in the app. Do not submit another request blindly.'
            : 'Immediate publishing requested. This is not confirmation the post is live; use get_publishing_status.',
    }, queueFailed));
    // Audit availability must not hide a known post ID or strand an otherwise completed reservation.
    try {
        await db.activity.create({ data: { organizationId, userId: principal.userId, userName: principal.userName,
            action: 'publish_requested', resourceType: 'post', resourceId: postId,
            resourceName: 'MCP immediate publish',
            details: `MCP key ${principal.keyId}; request ${requestId}` } });
    } catch (error) {
        logger.error({ err: error, postId, requestId, keyId: principal.keyId }, 'MCP publish audit failed');
    }
    return completed;
}

export function createPublishingServer(principal: PublishingPrincipal) {
    const server = new McpServer({ name: 'overseek-socials-publishing', version: '1.0.0' });
    const readAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
    if (principal.canUpload) {
        server.registerTool('upload_media', {
            description: 'Save a file (up to 8 MiB decoded) to the workspace media library using base64 bytes. Returns an id to pass in publish_now.mediaIds. Does not publish anything. For larger files use get_media_upload_config. Repeated uploads create separate library items.',
            inputSchema: uploadInput,
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        }, async input => safeTool(async () => {
            const result = await uploadInline(principal, input);
            return toolResult(result, result.status >= 400);
        }));
        server.registerTool('get_media_upload_config', {
            description: 'Get multipart streaming upload instructions and file size limits for large media, using the same API key. The upload returns a media id for publish_now.',
            inputSchema: z.strictObject({}), annotations: readAnnotations,
        }, async () => toolResult(mediaUploadConfig()));
    }
    if (principal.canRead) {
        server.registerTool('list_accounts', {
            description: 'List active accounts that support automatic publishing in this workspace. Never returns platform credentials.',
            inputSchema: z.strictObject({}), annotations: readAnnotations,
        }, async () => safeTool(async () => toolResult({ accounts: await db.socialAccount.findMany({
            where: { organizationId: principal.organizationId, isActive: true, platform: { not: 'MANUAL' } },
            select: { id: true, platform: true, name: true, username: true }, take: 100, orderBy: { id: 'asc' },
        }) })));
    }
    if (principal.canReadMedia) {
        server.registerTool('list_media', {
            description: 'List workspace media IDs for publishing. Upload new files with upload_media or the streaming upload endpoint; arbitrary remote URL imports are not supported.',
            inputSchema: z.strictObject({ offset: z.number().int().min(0).max(100_000).default(0) }), annotations: readAnnotations,
        }, async ({ offset }) => safeTool(async () => toolResult({ media: await db.media.findMany({
            where: { organizationId: principal.organizationId }, skip: offset, take: 50,
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            select: { id: true, filename: true, mimeType: true, transcodeStatus: true },
        }) })));
        server.registerTool('get_media_status', {
            description: 'Check workspace media metadata and video transcoding status before referencing its id in publish_now. Pending/processing media is still being prepared; failed transcoding needs attention in the app.',
            inputSchema: z.strictObject({ mediaId: id }), annotations: readAnnotations,
        }, async ({ mediaId }) => safeTool(async () => {
            const media = await db.media.findFirst({
                where: { id: mediaId, organizationId: principal.organizationId },
                select: { id: true, filename: true, mimeType: true, size: true, transcodeStatus: true },
            });
            return media ? toolResult({ media }) : toolResult({ error: 'Media not found' }, true);
        }));
    }
    if (principal.canReadAnalytics) {
        // Registration decides what clients can discover; this re-check keeps the handlers safe if
        // they are ever wired up without it. Handlers may also return { error, status } (foreign post).
        const readTool = (handler: (input: unknown) => Promise<object>) =>
            async (input: unknown) => safeTool(async () => {
                if (!principal.canReadAnalytics) return toolResult({ error: 'Analytics permission required', status: 403 }, true);
                const result = await handler(input);
                return toolResult(result, typeof (result as { error?: unknown }).error === 'string');
            });
        server.registerTool('get_analytics_summary', {
            description: 'Engagement and posting totals for a reporting window, with previous-period percentage changes, matching the app analytics page. Read-only: no platform analytics sync is triggered, so check syncedAt before treating recent dates as complete.',
            inputSchema: analyticsInput, annotations: readAnnotations,
        }, readTool(input => analyticsSummary(principal.organizationId, input)));
        server.registerTool('get_account_growth', {
            description: 'Current follower counts and follower change per connected account for a reporting window, plus profile views and website clicks. Daily series are omitted.',
            inputSchema: analyticsInput, annotations: readAnnotations,
        }, readTool(input => accountGrowth(principal.organizationId, input)));
        server.registerTool('get_top_posts', {
            description: 'The five best performing published posts in a reporting window, ranked by engagement rate, with post ids usable in get_post_analytics. Posts without synced metrics are absent rather than zero.',
            inputSchema: analyticsInput, annotations: readAnnotations,
        }, readTool(input => topPosts(principal.organizationId, input)));
        server.registerTool('get_post_analytics', {
            description: 'Stored metrics and publishing state for one workspace post. An empty metrics row means never published or not yet synced, not zero performance.',
            inputSchema: z.strictObject({ postId: id }), annotations: readAnnotations,
        }, readTool(input => getPostAnalytics(principal.organizationId, input)));
    }
    if (principal.canPublish) server.registerTool('publish_now', {
        description: 'Publish immediately to ONE connected account using existing workspace media. No drafts or future schedules. Publishing happens asynchronously; check status. Requires an operation UUID to protect against duplicate submissions.',
        inputSchema: publishInput,
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    }, async input => safeTool(() => publishImmediately(principal, input)));
    if (principal.canRead || principal.canPublish) server.registerTool('get_publishing_status', {
        description: 'Check a workspace post without republishing. A queued/processing result is NOT a confirmed publication.',
        inputSchema: z.strictObject({ postId: id }), annotations: readAnnotations,
    }, async ({ postId }) => safeTool(async () => {
        const post = await db.post.findFirst({
            where: { id: postId, organizationId: principal.organizationId },
            select: { id: true, status: true, platformPostId: true, publishedAt: true,
                errors: { orderBy: { occurredAt: 'desc' }, take: 1, select: { errorCode: true } } },
        });
        if (!post) return toolResult({ error: 'Post not found' }, true);
        return toolResult({ postId: post.id, status: post.status.toLowerCase(), publishedAt: post.publishedAt,
            publishing: getPublishingStatus(post, post.errors[0]?.errorCode) });
    }));
    return server;
}
