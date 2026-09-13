import { z } from 'zod';
import { Platform, Prisma } from '@/generated/prisma/client';
import { buildInboxCTE, inboxQuerySchema } from '../query';

export const reportingQuerySchema = z.object({
    socialAccountId: z.string().min(1).max(512).optional(),
    platform: z.string().transform((v) => v.toUpperCase()).pipe(z.enum(Platform)).optional(),
}).strict();

export const reportingDefinitions = {
    aging: 'Age is time since latest conversation activity, including outbound DMs and comment replies; it is not waiting or response time. Aging counts only effectively open items. Older-than thresholds are strict (>24h, >72h); buckets are <24h, 24h through 72h inclusive, and >72h. Future activity falls in under24h.',
    resolutions: 'recentResolutions is omitted: InboxActivity stores kind and description but no previous status or initial-state marker. kind=status and description="Status changed to resolved" cannot distinguish a known-state transition from an initial workflow write. Current resolved totals are a workload snapshot, not resolution events or response-time metrics.',
};

export interface ReportingData {
    generatedAt: string;
    summary: { open: number; resolved: number; snoozed: number; unassignedOpen: number; openOlderThan24h: number; openOlderThan72h: number };
    byType: { type: 'comment' | 'mention' | 'dm' | 'review'; open: number; resolved: number; snoozed: number }[];
    byAssignee: { userId: string | null; name: string; open: number; olderThan24h: number }[];
    ageBuckets: { key: 'under24h' | '24to72h' | 'over72h'; label: string; count: number }[];
}

/** One SQL aggregate row; no raw inbox items are transferred to Node. */
export function buildReportingQuery(organizationId: string, input: z.infer<typeof reportingQuerySchema>, now: Date) {
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000);
    return Prisma.sql`${buildInboxCTE(organizationId, '', inboxQuerySchema.parse(input), now)},
    totals AS (
        SELECT count(*) FILTER (WHERE status = 'open') AS open,
            count(*) FILTER (WHERE status = 'resolved') AS resolved,
            count(*) FILTER (WHERE status = 'snoozed') AS snoozed,
            count(*) FILTER (WHERE status = 'open' AND assigned_to IS NULL) AS unassigned,
            count(*) FILTER (WHERE status = 'open' AND activity < ${dayAgo}) AS older24,
            count(*) FILTER (WHERE status = 'open' AND activity < ${threeDaysAgo}) AS older72,
            count(*) FILTER (WHERE status = 'open' AND activity > ${dayAgo}) AS under24,
            count(*) FILTER (WHERE status = 'open' AND activity <= ${dayAgo} AND activity >= ${threeDaysAgo}) AS between24and72
        FROM filtered
    ), types AS (
        SELECT t.type, t.ordinal, count(*) FILTER (WHERE f.status = 'open') AS open,
            count(*) FILTER (WHERE f.status = 'resolved') AS resolved,
            count(*) FILTER (WHERE f.status = 'snoozed') AS snoozed
        FROM (VALUES ('comment', 1), ('mention', 2), ('dm', 3), ('review', 4)) t(type, ordinal)
        LEFT JOIN filtered f ON f.type = t.type GROUP BY t.type, t.ordinal
    ), assignments AS (
        SELECT assigned_to, count(*) FILTER (WHERE status = 'open') AS open,
            count(*) FILTER (WHERE status = 'open' AND activity < ${dayAgo}) AS older24
        FROM filtered GROUP BY assigned_to
    ), assignees AS (
        SELECT keys.assigned_to AS user_id,
            CASE WHEN keys.assigned_to IS NULL THEN 'Unassigned'
                WHEN m."userId" IS NULL OR u.id IS NULL THEN 'Deleted assignee'
                ELSE COALESCE(NULLIF(u.name, ''), 'Teammate') END AS name,
            COALESCE(a.open, 0) AS open, COALESCE(a.older24, 0) AS older24
        FROM (SELECT assigned_to FROM assignments UNION SELECT NULL::text) keys
        LEFT JOIN assignments a ON a.assigned_to IS NOT DISTINCT FROM keys.assigned_to
        LEFT JOIN "OrganizationMember" m ON m."organizationId" = ${organizationId} AND m."userId" = keys.assigned_to
        LEFT JOIN "User" u ON u.id = m."userId"
    )
    SELECT jsonb_build_object(
        'generatedAt', ${now.toISOString()}::text,
        'summary', jsonb_build_object('open', open, 'resolved', resolved, 'snoozed', snoozed,
            'unassignedOpen', unassigned, 'openOlderThan24h', older24, 'openOlderThan72h', older72),
        'byType', (SELECT jsonb_agg(jsonb_build_object('type', type, 'open', open, 'resolved', resolved, 'snoozed', snoozed) ORDER BY ordinal) FROM types),
        'byAssignee', (SELECT jsonb_agg(jsonb_build_object('userId', user_id, 'name', name, 'open', open, 'olderThan24h', older24) ORDER BY user_id NULLS FIRST) FROM assignees),
        'ageBuckets', jsonb_build_array(
            jsonb_build_object('key', 'under24h', 'label', 'Under 24 hours', 'count', under24),
            jsonb_build_object('key', '24to72h', 'label', '24–72 hours', 'count', between24and72),
            jsonb_build_object('key', 'over72h', 'label', 'Over 72 hours', 'count', older72))
    ) AS data FROM totals`;
}
