/**
 * Seb's chat tools and artifacts.
 * Why: Seb's briefing sends a snapshot of the workspace with every prompt, which
 * answers "what should I do" but not "what is in my library" or "put this in the
 * calendar". Each handler reuses the service the HTTP route uses, so a tool call can
 * never bypass the validation, tenancy checks, or activity logging a click would.
 *
 * Permission-gated twice on purpose: `availableSebTools` decides what the model may
 * discover, and every handler re-checks, so a hallucinated call cannot outrun the
 * member's grants.
 */
import { z } from 'zod';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { PERMISSIONS, type PermissionCode } from '@/lib/auth/permissions';
import { invalidatePostCaches } from '@/lib/cache';
import { reschedulePost } from '@/lib/queue';
import { findScheduleConflict, formatScheduleConflictError } from '@/lib/schedule-conflicts';
import { analyticsInput, analyticsSummary, accountGrowth, topPosts } from '@/lib/mcp/analytics';
import { formatSebLocalDate } from './seb-time';

/** Bounded so one tool turn cannot flood the conversation window. */
const MEDIA_LIMIT = 12;
const POST_LIMIT = 12;
const CAPTION_PREVIEW = 280;

/** Who a tool acts as. Permissions come from the member's grants, never the model. */
export type SebToolContext = {
    organizationId: string;
    userId: string;
    userName: string;
    timezone: string;
    permissions: Set<string>;
};

/** Preview payload kept on the assistant message and rendered as a card in chat. */
export type SebArtifact =
    | { kind: 'media'; id: string; title: string; items: SebMediaItem[] }
    /** `write` marks an artifact that changed the workspace, so the client refreshes its lists. */
    | { kind: 'posts'; id: string; title: string; posts: SebPostItem[]; write?: boolean }
    | { kind: 'metrics'; id: string; title: string; range: string; rows: { label: string; value: string; change?: number | null }[]; note?: string };

/** Media shape the chat already renders, plus the details the library card shows. */
export type SebMediaItem = {
    id: string;
    title: string;
    type: 'image' | 'video' | 'audio';
    mimeType: string;
    url: string;
    previewUrl: string;
    width?: number | null;
    height?: number | null;
    duration?: number | null;
    rationale: string;
    postId?: string;
    caption?: string;
    platform?: string | null;
    status?: string;
    folder?: string | null;
    tags?: string[];
    usedInPosts?: number;
};

export type SebPostItem = {
    id: string;
    caption: string;
    status: string;
    platform: string | null;
    accountName: string;
    postType: string;
    scheduledAt: string | null;
    publishedAt: string | null;
    editUrl: string;
    media: { previewUrl: string; type: 'image' | 'video' | 'audio' }[];
};

export type SebToolTrace = { name: string; label: string; ok: boolean };

type ToolOutcome = { content?: unknown; artifacts?: SebArtifact[]; error?: string };

type SebTool = {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    /** Every listed permission is required, both to discover and to run. */
    permissions: PermissionCode[];
    readOnly: boolean;
    trace: (args: Record<string, unknown>, outcome: ToolOutcome) => string;
    run: (ctx: SebToolContext, args: Record<string, unknown>) => Promise<ToolOutcome>;
};

// ── Arguments ────────────────────────────────────────────────────────────

const id = z.string().min(1).max(100);
const invalid = (issues: z.ZodIssue[]) => `Invalid arguments: ${issues.map(issue => `${issue.path.join('.') || 'input'} ${issue.message}`).join('; ')}`;

const searchMediaInput = z.object({
    query: z.string().min(1).max(200).optional().describe('Words to match in filenames, alt text, and tags.'),
    type: z.enum(['image', 'video', 'audio']).optional().describe('Restrict to one kind of file.'),
    usage: z.enum(['used', 'unused']).optional().describe('Only assets already attached to posts, or only never-used ones.'),
    folderId: id.optional().describe('Limit to one media folder. Omit to search the whole library.'),
    limit: z.number().int().min(1).max(MEDIA_LIMIT).default(6).describe('How many results to return, newest first.'),
});

const mediaDetailsInput = z.object({ mediaId: id.describe('A media id from search_media or an earlier reply.') });

const listPostsInput = z.object({
    status: z.enum(['draft', 'scheduled', 'published']).default('draft').describe('Which queue to look at.'),
    search: z.string().min(1).max(200).optional().describe('Words to match in the caption.'),
    limit: z.number().int().min(1).max(POST_LIMIT).default(8).describe('How many posts to return.'),
});

const draftPostInput = z.object({
    caption: z.string().min(1).max(30_000).describe('The full post text, in the brand voice, ready to publish.'),
    accountIds: z.array(id).min(1).max(20).describe('Connected account ids; one post is created per account.'),
    mediaIds: z.array(id).max(35).default([]).describe('Library media ids to attach, in the order they should appear.'),
    hashtags: z.array(z.string().min(1).max(60)).max(30).default([]).describe('Tags without the # symbol.'),
    postType: z.enum(['FEED', 'REEL', 'STORY', 'CAROUSEL', 'PIN', 'VIDEO', 'ARTICLE', 'THREAD']).optional().describe('Format for the attached creative. Use CAROUSEL for several images.'),
    firstComment: z.string().max(5_000).optional().describe('Published as the first comment where the platform supports it.'),
    scheduledAt: z.string().datetime().optional().describe('ISO 8601 UTC timestamp. Omit to leave the post as an unscheduled draft.'),
});

const updateDraftInput = z.object({
    postId: id.describe('The draft post to change.'),
    caption: z.string().min(1).max(30_000).optional().describe('Replaces the whole caption.'),
    mediaIds: z.array(id).max(35).optional().describe('Replaces the attached media set entirely.'),
    hashtags: z.array(z.string().min(1).max(60)).max(30).optional().describe('Replaces the attached tags.'),
    firstComment: z.string().max(5_000).nullable().optional().describe('Replaces or clears the first comment.'),
});

const scheduleDraftInput = z.object({
    postId: id.describe('The draft or scheduled post to place on the calendar.'),
    scheduledAt: z.string().datetime().describe('ISO 8601 UTC timestamp in the future.'),
});

const jsonSchema = (schema: z.ZodType) => {
    const { $schema: _schema, ...parameters } = z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>;
    return parameters;
};

// ── Mappers ──────────────────────────────────────────────────────────────

type MediaRow = {
    id: string; filename: string; mimeType: string; url: string; transcodedUrl: string | null;
    thumbnailUrl: string | null; width: number | null; height: number | null; duration: number | null;
    size?: number; altText?: string | null; tags: string[]; aiTags: string[];
    folder?: { name: string } | null; _count?: { posts: number };
};

function mediaKind(mimeType: string) {
    return mimeType.startsWith('video/') ? 'video' as const : mimeType.startsWith('audio/') ? 'audio' as const : 'image' as const;
}

function mediaItem(media: MediaRow, rationale: string): SebMediaItem {
    const type = mediaKind(media.mimeType);
    return {
        id: media.id,
        title: media.filename,
        type,
        mimeType: media.mimeType,
        url: media.transcodedUrl || media.url,
        // Videos without a thumbnail still need a playable url for the chat preview.
        previewUrl: media.thumbnailUrl || (type === 'image' ? media.transcodedUrl || media.url : media.url),
        width: media.width,
        height: media.height,
        duration: media.duration,
        rationale,
        folder: media.folder?.name ?? null,
        tags: [...new Set([...media.tags, ...media.aiTags])].slice(0, 20),
        usedInPosts: media._count?.posts ?? 0,
    };
}

type PostRow = {
    id: string; caption: string; status: string; platform: string | null; postType: string;
    scheduledAt: Date | null; publishedAt: Date | null;
    socialAccount: { name: string } | null;
    media?: readonly { customThumbnailUrl: string | null; media: { url: string; transcodedUrl: string | null; thumbnailUrl: string | null; mimeType: string } }[];
};

function postItems(posts: readonly PostRow[], timezone: string): SebPostItem[] {
    return posts.map(post => ({
        id: post.id,
        caption: post.caption.slice(0, CAPTION_PREVIEW),
        status: post.status.toLowerCase(),
        platform: post.platform?.toLowerCase() ?? null,
        // A deleted account leaves the post readable rather than anonymous.
        accountName: post.socialAccount?.name ?? (post.platform ? `Connected ${post.platform.toLowerCase()} account` : 'No account set'),
        postType: post.postType.toLowerCase(),
        scheduledAt: formatSebLocalDate(post.scheduledAt, timezone),
        publishedAt: formatSebLocalDate(post.publishedAt, timezone),
        editUrl: `/compose?edit=${encodeURIComponent(post.id)}`,
        media: (post.media || []).map(item => ({
            previewUrl: item.customThumbnailUrl || item.media.thumbnailUrl
                || (item.media.mimeType.startsWith('image/') ? item.media.transcodedUrl || item.media.url : ''),
            type: mediaKind(item.media.mimeType),
        })).filter(item => item.previewUrl),
    }));
}

const postInclude = {
    socialAccount: { select: { name: true } },
    media: { include: { media: true }, orderBy: { order: 'asc' as const }, take: 6 },
};

async function postSnapshot(organizationId: string, postIds: string[], timezone: string) {
    const found = await db.post.findMany({ where: { id: { in: postIds }, organizationId }, include: postInclude });
    // Keep the order the caller asked about rather than the database's.
    return postItems(postIds.flatMap(postId => found.filter(post => post.id === postId)), timezone);
}

/** Seb must never attach creative or target accounts the workspace does not own. */
async function ownedIds(organizationId: string, ids: string[], kind: 'media' | 'account') {
    const unique = [...new Set(ids)];
    if (!unique.length) return { ok: [] as string[], missing: [] as string[] };
    const found = kind === 'media'
        ? await db.media.findMany({ where: { id: { in: unique }, organizationId }, select: { id: true } })
        // A disconnected account cannot publish, so it is not owned for drafting.
        : await db.socialAccount.findMany({ where: { id: { in: unique }, organizationId, isActive: true }, select: { id: true } });
    const owned = new Set(found.map(row => row.id));
    return { ok: unique.filter(value => owned.has(value)), missing: unique.filter(value => !owned.has(value)) };
}

async function logSebActivity(ctx: SebToolContext, action: string, postId: string, resourceName: string, details: string) {
    await db.activity.create({
        data: {
            organizationId: ctx.organizationId, userId: ctx.userId, userName: ctx.userName,
            action, resourceType: 'post', resourceId: postId,
            resourceName: resourceName.slice(0, 200), details: details.slice(0, 500),
        },
    }).catch(err => logger.error({ err, postId }, 'Seb tool activity log failed'));
}

// ── Read handlers ────────────────────────────────────────────────────────

async function readMedia(ctx: SebToolContext, raw: Record<string, unknown>): Promise<ToolOutcome> {
    const parsed = searchMediaInput.safeParse(raw);
    if (!parsed.success) return { error: invalid(parsed.error.issues) };
    const { query, type, usage, folderId, limit } = parsed.data;

    const where: Record<string, unknown> = { organizationId: ctx.organizationId };
    if (folderId) where.folderId = folderId;
    if (type) where.mimeType = { startsWith: `${type}/` };
    if (query) {
        const terms = query.split(/[\s,]+/).filter(term => term.length > 1).slice(0, 6);
        where.OR = [
            { filename: { contains: query, mode: 'insensitive' } },
            { altText: { contains: query, mode: 'insensitive' } },
            ...(terms.length ? [{ tags: { hasSome: terms } }, { aiTags: { hasSome: terms } }] : []),
        ];
    }
    if (usage) where.posts = usage === 'used' ? { some: {} } : { none: {} };

    const media = await db.media.findMany({
        where,
        include: { folder: { select: { name: true } }, _count: { select: { posts: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
    });
    const items = media.map(item => mediaItem(item, query ? `Matched “${query}”` : 'Newest in your library'));

    return {
        content: {
            count: items.length,
            media: items.map(item => ({
                mediaId: item.id, title: item.title, type: item.type, folder: item.folder, tags: item.tags,
                usedInPosts: item.usedInPosts,
                dimensions: item.width && item.height ? `${item.width}x${item.height}` : null,
                durationSeconds: item.duration,
            })),
            note: items.length
                ? 'The member already sees these as a media strip. Refer to them by title, never by id.'
                : 'Nothing matched. Try fewer words, a different type, or drop the usage filter.',
        },
        artifacts: items.length
            ? [{ kind: 'media', id: `media:${items[0].id}:${Date.now()}`, title: query ? `Media matching “${query}”` : 'From your media library', items }]
            : undefined,
    };
}

async function readMediaDetails(ctx: SebToolContext, raw: Record<string, unknown>): Promise<ToolOutcome> {
    const parsed = mediaDetailsInput.safeParse(raw);
    if (!parsed.success) return { error: invalid(parsed.error.issues) };
    const media = await db.media.findFirst({
        where: { id: parsed.data.mediaId, organizationId: ctx.organizationId },
        include: {
            folder: { select: { name: true } },
            _count: { select: { posts: true } },
            sebAnalyses: { orderBy: { createdAt: 'desc' }, take: 1, select: { analysis: true } },
            posts: { orderBy: { post: { createdAt: 'desc' } }, take: 5, select: { post: { select: { id: true, status: true, platform: true, scheduledAt: true } } } },
        },
    });
    if (!media) return { error: 'Media not found in this workspace.' };

    const item = mediaItem(media, 'You asked about this file');
    const analysis = media.sebAnalyses[0];
    return {
        content: {
            media: {
                mediaId: item.id, title: item.title, type: item.type, mimeType: media.mimeType, sizeBytes: media.size,
                dimensions: media.width && media.height ? `${media.width}x${media.height}` : null,
                durationSeconds: media.duration, folder: item.folder, tags: item.tags, altText: media.altText,
            },
            usedIn: media.posts.map(entry => ({
                postId: entry.post.id, status: entry.post.status.toLowerCase(),
                platform: entry.post.platform?.toLowerCase() ?? null,
                scheduledAt: formatSebLocalDate(entry.post.scheduledAt, ctx.timezone),
            })),
            // Seb's own earlier read, so he does not re-judge a file from its filename.
            previousVisualAnalysis: analysis?.analysis ?? null,
            note: analysis
                ? 'previousVisualAnalysis is Seb\'s earlier read of these exact pixels, not a fresh look.'
                : 'No visual analysis recorded for this file yet. Describe only what the metadata supports.',
        },
        artifacts: [{ kind: 'media', id: `media:${item.id}`, title: item.title, items: [item] }],
    };
}

async function readPosts(ctx: SebToolContext, raw: Record<string, unknown>): Promise<ToolOutcome> {
    const parsed = listPostsInput.safeParse(raw);
    if (!parsed.success) return { error: invalid(parsed.error.issues) };
    const { status, search, limit } = parsed.data;
    // SCHEDULED and PUBLISHING are both "on the calendar"; PUBLISHING has still to leave.
    const statuses: import('@/generated/prisma/enums').PostStatus[] = status === 'draft' ? ['DRAFT'] : status === 'scheduled' ? ['SCHEDULED', 'PUBLISHING'] : ['PUBLISHED'];

    const posts = await db.post.findMany({
        where: {
            organizationId: ctx.organizationId, status: { in: statuses }, isExternal: false,
            ...(search ? { caption: { contains: search, mode: 'insensitive' } } : {}),
        },
        include: postInclude,
        orderBy: status === 'scheduled' ? [{ scheduledAt: 'asc' }] : [{ createdAt: 'desc' }],
        take: limit,
    });
    const items = postItems(posts, ctx.timezone);

    return {
        content: {
            status, count: items.length,
            posts: items.map(item => ({
                postId: item.id, caption: item.caption, platform: item.platform, accountName: item.accountName,
                postType: item.postType, scheduledAt: item.scheduledAt, publishedAt: item.publishedAt, mediaCount: item.media.length,
            })),
            note: items.length ? 'The member can open any of these from the card in chat.' : `No ${status} posts found.`,
        },
        artifacts: items.length
            ? [{ kind: 'posts', id: `posts:${status}:${Date.now()}`, title: status === 'draft' ? 'Your drafts' : status === 'scheduled' ? 'Coming up' : 'Recently published', posts: items }]
            : undefined,
    };
}

async function readAccounts(ctx: SebToolContext): Promise<ToolOutcome> {
    const accounts = await db.socialAccount.findMany({
        where: { organizationId: ctx.organizationId, isActive: true },
        select: { id: true, platform: true, name: true, username: true },
        orderBy: [{ platform: 'asc' }, { name: 'asc' }],
        take: 100,
    });
    return {
        content: {
            accounts: accounts.map(account => ({
                accountId: account.id, platform: account.platform.toLowerCase(),
                name: account.name, username: account.username, manualOnly: account.platform === 'MANUAL',
            })),
            note: accounts.length ? 'Use these accountId values with draft_post.' : 'No connected accounts, so no post can be drafted yet.',
        },
    };
}

async function readAnalytics(ctx: SebToolContext, raw: Record<string, unknown>): Promise<ToolOutcome> {
    const parsed = analyticsInput.safeParse(raw);
    if (!parsed.success) return { error: invalid(parsed.error.issues) };
    const [summary, growth] = await Promise.all([
        analyticsSummary(ctx.organizationId, parsed.data),
        accountGrowth(ctx.organizationId, parsed.data).catch(() => null),
    ]);
    const window = parsed.data.range === 'year' ? '12 months' : `${parsed.data.range.slice(0, -1)} days`;
    const rows = [
        { label: 'Posts published', value: String(summary.posts.published), change: summary.posts.createdChangePercent },
        { label: 'Likes', value: String(summary.engagement.likes), change: summary.engagement.changePercent.likes },
        { label: 'Comments', value: String(summary.engagement.comments), change: summary.engagement.changePercent.comments },
        { label: 'Saves', value: String(summary.engagement.saves), change: summary.engagement.changePercent.saves },
        { label: 'Reach', value: String(summary.engagement.reach), change: summary.engagement.changePercent.reach },
        { label: 'Engagement rate', value: `${summary.engagement.engagementRatePercent.toFixed(2)}%` },
        ...(growth ? [{ label: 'Followers', value: String(growth.totals.followers), change: growth.totals.followerChange }] : []),
    ];

    return {
        content: {
            range: summary.range, platform: summary.platform, hasData: summary.hasData,
            posts: summary.posts, engagement: summary.engagement,
            followers: growth?.totals.followers ?? null, followerChange: growth?.totals.followerChange ?? null,
            syncedAt: summary.postMetricsSyncedAt, metricNote: summary.metricNote,
        },
        artifacts: [{ kind: 'metrics', id: `metrics:${summary.range}:${summary.platform}`, title: `Last ${window}`, range: summary.range, rows, note: summary.metricNote }],
    };
}

async function readTopPosts(ctx: SebToolContext, raw: Record<string, unknown>): Promise<ToolOutcome> {
    const parsed = analyticsInput.safeParse(raw);
    if (!parsed.success) return { error: invalid(parsed.error.issues) };
    const ranked = await topPosts(ctx.organizationId, { range: parsed.data.range, platform: parsed.data.platform });
    const posts = await db.post.findMany({
        where: { organizationId: ctx.organizationId, id: { in: ranked.posts.map(post => post.postId) } },
        include: postInclude,
    });
    // Keep the ranking order the analytics helper returned.
    const items = postItems(ranked.posts.flatMap(entry => posts.filter(post => post.id === entry.postId)), ctx.timezone);
    const window = parsed.data.range === 'year' ? '12 months' : `${parsed.data.range.slice(0, -1)} days`;

    return {
        content: {
            range: ranked.range, platform: ranked.platform,
            posts: ranked.posts.map(post => ({
                postId: post.postId, platform: post.platform, publishedAt: post.publishedAt,
                engagementRatePercent: post.engagementRatePercent, likes: post.likes, comments: post.comments,
                shares: post.shares, videoViews: post.videoViews, caption: post.caption,
            })),
            note: ranked.note,
        },
        artifacts: items.length ? [{ kind: 'posts', id: `top:${ranked.range}:${ranked.platform}`, title: `Top posts, last ${window}`, posts: items }] : undefined,
    };
}

// ── Write handlers ───────────────────────────────────────────────────────

async function writeDraft(ctx: SebToolContext, raw: Record<string, unknown>): Promise<ToolOutcome> {
    const parsed = draftPostInput.safeParse(raw);
    if (!parsed.success) return { error: invalid(parsed.error.issues) };
    const { caption, accountIds, mediaIds, hashtags, postType, firstComment, scheduledAt } = parsed.data;

    const accounts = await ownedIds(ctx.organizationId, accountIds, 'account');
    if (accounts.missing.length) return { error: `Account not found in this workspace: ${accounts.missing.join(', ')}. Call list_accounts for valid ids.` };

    const media = await ownedIds(ctx.organizationId, mediaIds, 'media');
    // Never silently drop creative: a carousel missing an image is a wrong post.
    if (media.missing.length) return { error: `Media not found in this workspace: ${media.missing.join(', ')}. Search the library again for valid ids.` };

    const { createPosts } = await import('@/lib/posts-service');
    const created = await createPosts({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        userName: `${ctx.userName} (via Seb)`,
        caption,
        platformAccountIds: accounts.ok,
        mediaIds: media.ok,
        hashtags,
        firstComment: firstComment || undefined,
        scheduledAt: scheduledAt || null,
        // Seb never queues a publish: a member reviews the draft, or schedules it on purpose.
        autoPublish: false,
        platformSettings: Object.fromEntries(accounts.ok.map(accountId => [accountId, { ...(postType ? { postType } : {}) }])),
    });
    if (created.error) return { error: created.error };

    const postIds = (created.posts || []).map(post => post.id);
    if (postIds.length) {
        await db.post.updateMany({ where: { id: { in: postIds }, organizationId: ctx.organizationId }, data: { isAiGenerated: true } });
        await Promise.all(postIds.map(postId => logSebActivity(ctx, scheduledAt ? 'scheduled' : 'created', postId, caption, 'Seb drafted this from a chat')));
        invalidatePostCaches(ctx.organizationId);
    }
    const items = await postSnapshot(ctx.organizationId, postIds, ctx.timezone);

    return {
        content: {
            created: items.length,
            posts: items.map(item => ({ postId: item.id, accountName: item.accountName, status: item.status, scheduledAt: item.scheduledAt })),
            note: scheduledAt
                ? 'Saved with a publish reminder. Seb did not queue an automatic publish.'
                : 'Saved as drafts. Nothing is scheduled or published yet.',
        },
        artifacts: items.length
            ? [{ kind: 'posts', id: `draft:${items[0].id}`, title: scheduledAt ? 'Scheduled from chat' : 'Drafted from chat', posts: items, write: true }]
            : undefined,
    };
}

async function editDraft(ctx: SebToolContext, raw: Record<string, unknown>): Promise<ToolOutcome> {
    const parsed = updateDraftInput.safeParse(raw);
    if (!parsed.success) return { error: invalid(parsed.error.issues) };
    const { postId, caption, mediaIds, hashtags, firstComment } = parsed.data;
    if (caption === undefined && mediaIds === undefined && hashtags === undefined && firstComment === undefined) {
        return { error: 'Nothing to change. Supply caption, mediaIds, hashtags, or firstComment.' };
    }

    const post = await db.post.findFirst({
        where: { id: postId, organizationId: ctx.organizationId },
        select: { id: true, status: true, platformPostId: true },
    });
    if (!post) return { error: 'Post not found in this workspace.' };
    // Anything already sent to a platform is out of chat's reach.
    if (post.status !== 'DRAFT' || post.platformPostId) {
        return { error: `Only unsent drafts can be edited from chat. This post is ${post.status.toLowerCase()}.` };
    }

    const media = await ownedIds(ctx.organizationId, mediaIds || [], 'media');
    if (media.missing.length) return { error: `Media not found in this workspace: ${media.missing.join(', ')}` };

    const data: Record<string, unknown> = {};
    if (caption !== undefined) data.caption = caption;
    if (firstComment !== undefined) data.firstComment = firstComment;
    if (mediaIds !== undefined) {
        data.customMediaIds = media.ok;
        data.media = { deleteMany: {}, create: media.ok.map((mediaId, order) => ({ mediaId, order })) };
    }
    if (hashtags !== undefined) {
        const records: { id: string }[] = [];
        for (const tag of [...new Set(hashtags.map(value => value.toLowerCase().replace('#', '')))]) {
            records.push({ id: (await db.hashtag.upsert({ where: { tag }, update: {}, create: { tag } })).id });
        }
        data.hashtags = { deleteMany: {}, create: records.map(record => ({ hashtagId: record.id })) };
    }

    await db.post.update({ where: { id: postId, organizationId: ctx.organizationId }, data: data as never, select: { id: true } });
    await logSebActivity(ctx, 'updated', postId, caption || 'Draft updated by Seb', 'Seb edited this draft from a chat');
    invalidatePostCaches(ctx.organizationId);
    const items = await postSnapshot(ctx.organizationId, [postId], ctx.timezone);

    return {
        content: { postId, updated: true, note: 'The composer now shows these changes.' },
        artifacts: items.length ? [{ kind: 'posts', id: `draft:${postId}`, title: 'Updated draft', posts: items, write: true }] : undefined,
    };
}

async function scheduleDraft(ctx: SebToolContext, raw: Record<string, unknown>): Promise<ToolOutcome> {
    const parsed = scheduleDraftInput.safeParse(raw);
    if (!parsed.success) return { error: invalid(parsed.error.issues) };
    const { postId, scheduledAt } = parsed.data;

    const post = await db.post.findFirst({
        where: { id: postId, organizationId: ctx.organizationId },
        select: { id: true, status: true, platformPostId: true, platform: true },
    });
    if (!post) return { error: 'Post not found in this workspace.' };
    if (!['DRAFT', 'SCHEDULED', 'FAILED'].includes(post.status) || post.platformPostId) {
        return { error: `This post cannot be scheduled from chat. It is ${post.status.toLowerCase()}.` };
    }

    const target = new Date(scheduledAt);
    // Same 30s grace the composer uses: a past time publishes the moment the job runs.
    if (!Number.isFinite(target.getTime()) || target.getTime() < Date.now() - 30_000) {
        return { error: 'Scheduled time must be in the future. Confirm the date with the member.' };
    }

    const conflict = await findScheduleConflict({
        organizationId: ctx.organizationId,
        platforms: post.platform ? [post.platform] : [],
        scheduledAt: target,
        excludePostId: postId,
    });
    if (conflict) return { error: formatScheduleConflictError(conflict) };

    try {
        const result = await reschedulePost(postId, ctx.organizationId, target);
        await logSebActivity(ctx, 'scheduled', postId, 'Seb scheduled a post', `Seb scheduled to ${result.scheduledAt.toISOString()}`);
        invalidatePostCaches(ctx.organizationId);
        const items = await postSnapshot(ctx.organizationId, [postId], ctx.timezone);
        return {
            content: { postId, scheduledAt: formatSebLocalDate(result.scheduledAt, ctx.timezone), status: 'scheduled', note: 'Reminder set. Its auto-publish setting is unchanged.' },
            artifacts: items.length ? [{ kind: 'posts', id: `schedule:${postId}:${target.getTime()}`, title: 'On the calendar', posts: items, write: true }] : undefined,
        };
    } catch (err) {
        logger.warn({ err, postId }, 'Seb schedule tool failed');
        return { error: 'Scheduling failed. The post keeps its previous timing — check the calendar before retrying.' };
    }
}

// ── Legacy keyword fallback ──────────────────────────────────────────────

export type SebChatMediaAttachment = SebMediaItem;

function searchTokens(text: string) {
    return Array.from(new Set(text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 2 && !['the', 'and', 'for', 'this', 'that', 'with', 'from', 'what', 'how', 'why', 'you', 'seb', 'user', 'question', 'recommendation'].includes(word))
        .slice(0, 16)));
}

/**
 * Keyword guess used only when the model never called a tool.
 * Why: A model without tool support still should not return a blank-handed answer,
 * but a real search_media result always replaces this.
 */
export async function findSebChatMediaAttachments(organizationId: string, message: string, answer: string): Promise<SebChatMediaAttachment[]> {
    const tokens = searchTokens(`${message} ${answer}`);
    const visualIntent = /\b(show|see|visual|image|photo|video|preview|example|creative|design|hook|thumbnail|reel|story|ad)\b/i.test(`${message} ${answer}`);

    const posts = await db.post.findMany({
        where: { organizationId, media: { some: {} } },
        include: {
            socialAccount: { select: { platform: true, name: true } },
            media: { include: { media: true }, orderBy: { order: 'asc' }, take: 4 },
        },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: 60,
    });

    const scored = posts.flatMap(post => post.media.map(postMedia => {
        const haystack = [
            post.caption,
            post.platform,
            post.socialAccount?.platform,
            post.socialAccount?.name,
            postMedia.media.filename,
            postMedia.media.altText,
            ...postMedia.media.tags,
            ...postMedia.media.aiTags,
        ].filter(Boolean).join(' ').toLowerCase();
        const score = tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0) + (visualIntent ? 0.5 : 0);

        return {
            score,
            attachment: mediaItem(postMedia.media, score > 0 ? 'Matched Seb chat context' : 'Recent visual example'),
        };
    }));

    return scored
        .filter(item => item.score > 0 || visualIntent)
        .sort((a, b) => b.score - a.score)
        .filter((item, index, all) => all.findIndex(other => other.attachment.id === item.attachment.id) === index)
        .slice(0, visualIntent ? 6 : 3)
        .map(item => item.attachment);
}

// ── Registry ─────────────────────────────────────────────────────────────

export const SEB_TOOLS: SebTool[] = [
    {
        name: 'search_media', readOnly: true, permissions: [PERMISSIONS.MEDIA_VIEW],
        description: 'Search the workspace media library by words, file type, folder, or whether it has been used. Returns previews the member can see.',
        parameters: jsonSchema(searchMediaInput),
        trace: args => `Searched your media library${args.query ? ` for “${String(args.query).slice(0, 40)}”` : ''}`,
        run: readMedia,
    },
    {
        name: 'get_media_details', readOnly: true, permissions: [PERMISSIONS.MEDIA_VIEW],
        description: 'Read everything known about one media file: dimensions, tags, alt text, where it has been used, and Seb’s earlier visual read of it.',
        parameters: jsonSchema(mediaDetailsInput),
        trace: () => 'Checked a media file',
        run: readMediaDetails,
    },
    {
        name: 'list_accounts', readOnly: true, permissions: [PERMISSIONS.ACCOUNTS_VIEW],
        description: 'List the workspace’s connected accounts and their accountIds. Required before drafting, since every post needs a real account id.',
        parameters: jsonSchema(z.object({})),
        trace: () => 'Listed your connected accounts',
        run: ctx => readAccounts(ctx),
    },
    {
        name: 'list_posts', readOnly: true, permissions: [PERMISSIONS.ACCOUNTS_VIEW],
        description: 'List draft, scheduled, or recently published posts so Seb can avoid duplicates and timing clashes.',
        parameters: jsonSchema(listPostsInput),
        trace: args => `Looked at your ${typeof args.status === 'string' ? args.status : 'draft'} posts`,
        run: readPosts,
    },
    {
        name: 'get_analytics_summary', readOnly: true, permissions: [PERMISSIONS.ANALYTICS_VIEW],
        description: 'Engagement, posting volume, and follower totals for a reporting window, with previous-period changes. Read-only: never triggers a sync.',
        parameters: jsonSchema(analyticsInput),
        trace: () => 'Read your analytics',
        run: readAnalytics,
    },
    {
        name: 'get_top_posts', readOnly: true, permissions: [PERMISSIONS.ANALYTICS_VIEW],
        description: 'Best performing published posts in a window, ranked by engagement rate, so advice can cite real examples.',
        parameters: jsonSchema(analyticsInput),
        trace: () => 'Checked your top performing posts',
        run: readTopPosts,
    },
    {
        name: 'draft_post', readOnly: false, permissions: [PERMISSIONS.POSTS_CREATE],
        description: 'Create a real draft post in the workspace for one or more connected accounts, optionally attached to library media and scheduled. Never publishes. Account and media ids must come from list_accounts and search_media.',
        parameters: jsonSchema(draftPostInput),
        trace: (args, outcome) => outcome.error ? 'Tried to draft a post'
            : Array.isArray(args.accountIds) && args.accountIds.length > 1 ? `Drafted ${args.accountIds.length} posts` : 'Drafted a post',
        run: writeDraft,
    },
    {
        name: 'update_draft', readOnly: false, permissions: [PERMISSIONS.POSTS_EDIT],
        description: 'Change an unsent draft Seb or the member created: caption, attached media, hashtags, or first comment.',
        parameters: jsonSchema(updateDraftInput),
        trace: (_args, outcome) => outcome.error ? 'Tried to update a draft' : 'Updated the draft',
        run: editDraft,
    },
    {
        name: 'schedule_draft', readOnly: false, permissions: [PERMISSIONS.POSTS_SCHEDULE],
        description: 'Put an existing draft on the calendar at a future time. Sets the publish reminder only: nothing is published and no auto-publish flag changes.',
        parameters: jsonSchema(scheduleDraftInput),
        trace: (_args, outcome) => outcome.error ? 'Tried to schedule a draft' : 'Put it on the calendar',
        run: scheduleDraft,
    },
];

export function availableSebTools(permissions: Set<string>, modelSupportsTools: boolean) {
    if (!modelSupportsTools) return [];
    return SEB_TOOLS.filter(tool => tool.permissions.every(permission => permissions.has(permission)));
}

/** Wire format for the provider's `tools` parameter. */
export function sebToolDefinitions(tools: SebTool[]) {
    return tools.map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } }));
}

/** Names a model is allowed to call in this conversation, used for both schema and dispatch. */
export function allowedToolNames(permissions: Set<string>, modelSupportsTools: boolean) {
    return new Set(availableSebTools(permissions, modelSupportsTools).map(tool => tool.name));
}

export async function runSebTool(name: string, argsJson: string, ctx: SebToolContext, allowed: Set<string>) {
    const tool = SEB_TOOLS.find(candidate => candidate.name === name);
    if (!tool || !allowed.has(tool.name)) {
        return { content: { error: `Tool "${name || '(unnamed)'}" is not available in this conversation.` }, artifacts: [] as SebArtifact[], trace: { name: name || 'unknown', label: 'Tried a tool that is not available here', ok: false } };
    }

    let args: Record<string, unknown> = {};
    try {
        args = argsJson ? JSON.parse(argsJson) as Record<string, unknown> : {};
    } catch {
        return { content: { error: 'Tool arguments were not valid JSON. Retry with complete arguments.' }, artifacts: [] as SebArtifact[], trace: { name: tool.name, label: 'That tool call could not be read', ok: false } };
    }
    // Re-check: the schema is a hint, the member's grants are the rule.
    if (!tool.permissions.every(permission => ctx.permissions.has(permission))) {
        return { content: { error: 'The member does not have permission for that action. Explain what you can do instead.' }, artifacts: [] as SebArtifact[], trace: { name: tool.name, label: 'Skipped an action without permission', ok: false } };
    }

    try {
        const outcome = await tool.run(ctx, args);
        if (outcome.error) {
            logger.warn({ tool: tool.name, organizationId: ctx.organizationId }, 'Seb tool returned an error to the model');
            return { content: { error: outcome.error }, artifacts: [] as SebArtifact[], trace: { name: tool.name, label: tool.trace(args, outcome), ok: false } };
        }
        return { content: outcome.content, artifacts: outcome.artifacts || [], trace: { name: tool.name, label: tool.trace(args, outcome), ok: true } };
    } catch (err) {
        logger.error({ err, tool: tool.name, organizationId: ctx.organizationId }, 'Seb tool failed');
        return {
            content: { error: tool.readOnly
                ? 'That lookup failed. Answer from the supplied context instead.'
                : 'That action failed and its outcome is uncertain. Tell the member to check the app before retrying.' },
            artifacts: [] as SebArtifact[],
            trace: { name: tool.name, label: tool.trace(args, { content: null, error: 'failed' }), ok: false },
        };
    }
}
