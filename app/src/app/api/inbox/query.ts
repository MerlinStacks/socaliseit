import { z } from 'zod';
import { Prisma, Platform } from '@/generated/prisma/client';

const date = z.string().refine((v) => Number.isFinite(Date.parse(v)), 'Invalid date').optional();
export const inboxQuerySchema = z.object({
    type: z.enum(['all', 'comment', 'mention', 'dm', 'review']).default('all'),
    queue: z.enum(['all', 'open', 'mine', 'snoozed', 'resolved']).default('all'),
    q: z.string().max(500).default(''),
    socialAccountId: z.string().min(1).optional(),
    platform: z.string().transform((v) => v.toUpperCase()).pipe(z.enum(Platform)).optional(),
    sentiment: z.enum(['positive', 'negative', 'neutral', 'question']).optional(),
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    isRead: z.enum(['all', 'true', 'false']).default('all'),
    assignedTo: z.string().optional(),
    label: z.string().optional(),
    startDate: date,
    endDate: date,
}).refine((v) => !v.startDate || !v.endDate || Date.parse(v.startDate) <= Date.parse(v.endDate), 'Invalid date range');

/** Parameterized SQL only. Do not limit any source before global activity sorting.
 * DMs are grouped before search/read filters; search matches any message while
 * preview, counts and unread state always describe the complete conversation.
 */
export function buildInboxCTE(organizationId: string, userId: string, query: z.infer<typeof inboxQuerySchema>, now = new Date()) {
    const sourceScope = Prisma.sql`e."organizationId" = ${organizationId}
        ${query.socialAccountId ? Prisma.sql`AND e."socialAccountId" = ${query.socialAccountId}` : Prisma.empty}`;
    const filters = [Prisma.sql`TRUE`];
    if (query.type !== 'all') filters.push(Prisma.sql`type = ${query.type}`);
    if (query.platform) filters.push(Prisma.sql`platform = ${query.platform}`);
    if (query.sentiment) filters.push(Prisma.sql`sentiment = ${query.sentiment}`);
    if (query.q) filters.push(Prisma.sql`search_match`);
    if (query.isRead !== 'all') filters.push(Prisma.sql`is_read = ${query.isRead === 'true'}`);
    if (query.assignedTo) filters.push(Prisma.sql`assigned_to = ${query.assignedTo}`);
    if (query.label) filters.push(Prisma.sql`${query.label} = ANY(labels)`);
    if (query.queue === 'mine') filters.push(Prisma.sql`status = 'open' AND assigned_to = ${userId}`);
    else if (query.queue !== 'all') filters.push(Prisma.sql`status = ${query.queue}`);
    if (query.startDate) filters.push(Prisma.sql`activity >= ${new Date(query.startDate)}`);
    if (query.endDate) filters.push(Prisma.sql`activity <= ${new Date(query.endDate)}`);
    const search = (text: Prisma.Sql, author: Prisma.Sql) => Prisma.sql`
        (strpos(lower(COALESCE(${text}, '')), lower(${query.q})) > 0
        OR strpos(lower(COALESCE(${author}, '')), lower(${query.q})) > 0)`;

    return Prisma.sql`
    WITH dm_messages AS (
        SELECT e.* FROM "DirectMessage" e WHERE ${sourceScope}
    ), dm_groups AS (
        SELECT "socialAccountId", "conversationId", count(*)::int AS message_count,
            count(*) FILTER (WHERE direction = 'inbound' AND NOT "isRead")::int AS unread_count,
            bool_or(${search(Prisma.sql`text`, Prisma.sql`"senderUsername"`)}) AS search_match
        FROM dm_messages GROUP BY "socialAccountId", "conversationId"
    ), dm_latest AS (
        SELECT DISTINCT ON ("socialAccountId", "conversationId") * FROM dm_messages
        ORDER BY "socialAccountId", "conversationId", "createdAt" DESC, id DESC
    ), dm_senders AS (
        SELECT DISTINCT ON ("socialAccountId", "conversationId") * FROM dm_messages WHERE direction = 'inbound'
        ORDER BY "socialAccountId", "conversationId", "createdAt" ASC, id ASC
    ), sources AS (
        SELECT e.id, 'comment'::text AS type, e."socialAccountId" AS account_id, e.id AS entity_id,
            to_jsonb(e) AS raw, e."createdAt" AS created_at,
            GREATEST(e."createdAt", (SELECT max(r."createdAt") FROM "Comment" r
                WHERE r."parentId" = e.id AND r."organizationId" = ${organizationId}
                AND r."socialAccountId" = e."socialAccountId")) AS activity,
            e."authorId" AS author_id, e."authorUsername" AS author_name, e."authorAvatar" AS avatar,
            e.text, e."isRead" AS is_read, 1 + e."replyCount" AS message_count,
            CASE WHEN e."isRead" THEN 0 ELSE 1 END AS unread_count, e.sentiment,
            ${search(Prisma.sql`e.text`, Prisma.sql`e."authorUsername"`)} AS search_match,
            jsonb_build_object('platformPostId', e."platformPostId", 'platformCommentId', e."platformCommentId",
                'isReplied', e."isReplied", 'parentId', e."parentId") AS meta
        FROM "Comment" e WHERE ${sourceScope} AND e."parentId" IS NULL
        UNION ALL
        SELECT e.id, 'mention', e."socialAccountId", e.id, to_jsonb(e), e."createdAt", e."createdAt",
            e."authorId", e."authorUsername", e."authorAvatar", e.text, e."isRead", 1,
            CASE WHEN e."isRead" THEN 0 ELSE 1 END, NULL,
            ${search(Prisma.sql`e.text`, Prisma.sql`e."authorUsername"`)},
            jsonb_build_object('platformPostId', e."platformPostId", 'mentionType', e.type)
        FROM "Mention" e WHERE ${sourceScope}
        UNION ALL
        SELECT e.id, 'review', e."socialAccountId", e.id, to_jsonb(e), e."createdAt", e."createdAt",
            '', e."authorName", e."authorAvatar", e.text, e."isRead", 1,
            CASE WHEN e."isRead" THEN 0 ELSE 1 END,
            CASE WHEN e.rating >= 4 THEN 'positive' WHEN e.rating <= 2 THEN 'negative' ELSE 'neutral' END,
            ${search(Prisma.sql`e.text`, Prisma.sql`e."authorName"`)},
            jsonb_build_object('rating', e.rating, 'reviewId', e.id, 'platformReviewId', e."platformReviewId",
                'isReplied', e."isReplied", 'replyText', e."replyText", 'reviewUrl', e."reviewUrl")
        FROM "Review" e WHERE ${sourceScope}
        UNION ALL
        SELECT e.id, 'dm', e."socialAccountId", e."conversationId", to_jsonb(e), e."createdAt", e."createdAt",
            COALESCE(sender."senderId", e."senderId"), COALESCE(sender."senderUsername", e."senderUsername"),
            CASE WHEN sender."senderId" IS NOT NULL THEN sender."senderAvatar" ELSE e."senderAvatar" END,
            CASE WHEN e.direction = 'outbound' THEN 'You: ' || COALESCE(e.text, '') ELSE e.text END,
            g.unread_count = 0, g.message_count, g.unread_count, NULL, g.search_match,
            jsonb_build_object('platformMessageId', e."platformMessageId", 'conversationId', e."conversationId", 'direction', e.direction)
        FROM dm_groups g
        JOIN dm_latest e ON e."socialAccountId" = g."socialAccountId" AND e."conversationId" = g."conversationId"
        LEFT JOIN dm_senders sender ON sender."socialAccountId" = g."socialAccountId"
            AND sender."conversationId" = g."conversationId" AND e.direction = 'outbound'
    ), enriched AS (
        SELECT s.*, a.platform::text AS platform,
            jsonb_build_object('id', a.id, 'name', a.name, 'platform', a.platform, 'avatar', a.avatar) AS account,
            CASE WHEN w.status = 'SNOOZED' AND w."snoozedUntil" > ${now} THEN 'snoozed'
                WHEN w.status = 'RESOLVED' THEN 'resolved' ELSE 'open' END AS status,
            CASE WHEN w.status = 'SNOOZED' AND w."snoozedUntil" > ${now} THEN w."snoozedUntil" ELSE NULL END AS snoozed_until,
            CASE WHEN w.id IS NOT NULL THEN w."assignedToId" ELSE s.raw->>'assignedToId' END AS assigned_to,
            CASE WHEN w.id IS NOT NULL THEN w."labelIds" ELSE
                ARRAY(SELECT jsonb_array_elements_text(COALESCE(NULLIF(s.raw->'labelIds', 'null'::jsonb), '[]'::jsonb))) END AS labels
        FROM sources s JOIN "SocialAccount" a ON a.id = s.account_id AND a."organizationId" = ${organizationId}
        LEFT JOIN "InboxWorkflow" w ON w."organizationId" = ${organizationId} AND w."socialAccountId" = s.account_id
            AND w.type::text = upper(s.type) AND w."entityId" = s.entity_id
    ), filtered AS (
        SELECT * FROM enriched WHERE ${Prisma.join(filters, ' AND ')}
    )`;
}

/** List and reporting consume the same canonical, effective-workflow dataset. */
export function buildInboxQuery(organizationId: string, userId: string, query: z.infer<typeof inboxQuerySchema>, now = new Date()) {
    return Prisma.sql`${buildInboxCTE(organizationId, userId, query, now)}, page AS (
        SELECT *, raw || jsonb_build_object(
            'id', id, 'type', type, 'platform', platform, 'socialAccountId', account_id, 'socialAccount', account,
            'authorId', author_id, 'authorUsername', author_name, 'authorAvatar', avatar, 'text', text,
            'isRead', is_read, 'assignedToId', assigned_to, 'labelIds', labels, 'sentiment', sentiment,
            'createdAt', to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'lastActivityAt', to_char(activity, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'messageCount', message_count, 'unreadCount', unread_count,
            'meta', meta, 'workflow', jsonb_build_object('status', status,
                'snoozedUntil', to_char(snoozed_until, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                'assignedToId', assigned_to, 'labelIds', labels)) AS item
        FROM filtered ORDER BY activity DESC, type ASC, account_id ASC, id DESC LIMIT 30 OFFSET ${(query.page - 1) * 30}
    )
    SELECT COALESCE((SELECT jsonb_agg(item ORDER BY activity DESC, type ASC, account_id ASC, id DESC) FROM page), '[]'::jsonb) AS data,
        count(*)::int AS total, jsonb_build_object(
            'comments', count(*) FILTER (WHERE type = 'comment'), 'mentions', count(*) FILTER (WHERE type = 'mention'),
            'dms', count(*) FILTER (WHERE type = 'dm'), 'reviews', count(*) FILTER (WHERE type = 'review')) AS counts
    FROM filtered`;
}
