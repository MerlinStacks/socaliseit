// @vitest-environment node
/** Run with INBOX_TEST_DATABASE_URL pointing at a disposable PostgreSQL database.
 * Alternatively INBOX_TEST_PGLITE_MODULE may point to an externally installed
 * @electric-sql/pglite module; no application dependency is required.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { buildInboxAttentionCountQuery, buildInboxQuery, inboxQuerySchema } from '../query';
import { buildReportingQuery, ReportingData, reportingQuerySchema } from '../reporting/query';

const enabled = Boolean(process.env.INBOX_TEST_DATABASE_URL || process.env.INBOX_TEST_PGLITE_MODULE);
interface Row { id: string; type: string; text: string; socialAccountId: string; authorUsername: string;
    isRead: boolean; messageCount: number; unreadCount: number; workflow: { status: string; assignedToId: string | null; labelIds: string[] };
    socialAccount: { id: string }; meta: { rating?: number; reviewId?: string } }
interface Result { data: Row[]; total: number; counts: Record<string, number> }
let connection: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>; exec: (sql: string) => Promise<unknown>; close: () => Promise<unknown> };
const schema = `inbox_test_${Date.now()}`;
const now = new Date('2026-09-12T12:00:00Z');
async function list(params = {}) {
    const query = buildInboxQuery('org', 'member', inboxQuerySchema.parse(params), now);
    return (await connection.query(query.text, query.values)).rows[0] as Result;
}
async function report(params = {}) {
    const query = buildReportingQuery('org', reportingQuerySchema.parse(params), now);
    return ((await connection.query(query.text, query.values)).rows[0] as { data: ReportingData }).data;
}
async function attentionCount() {
    const query = buildInboxAttentionCountQuery('org', now);
    return ((await connection.query(query.text, query.values)).rows[0] as { total: number }).total;
}

describe.skipIf(!enabled)('unified inbox PostgreSQL query and migration', () => {
    beforeAll(async () => {
        if (process.env.INBOX_TEST_PGLITE_MODULE) {
            const { PGlite } = await import(/* @vite-ignore */ process.env.INBOX_TEST_PGLITE_MODULE);
            connection = new PGlite();
        } else {
            const pg = new Client({ connectionString: process.env.INBOX_TEST_DATABASE_URL });
            await pg.connect();
            connection = { query: (sql, values) => pg.query(sql, values), exec: (sql) => pg.query(sql), close: () => pg.end() };
        }
        await connection.exec(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};
            CREATE TABLE "Organization" (id text PRIMARY KEY);
            CREATE TABLE "User" (id text PRIMARY KEY, name text);
            CREATE TABLE "OrganizationMember" ("organizationId" text, "userId" text, UNIQUE ("organizationId", "userId"));
            CREATE TABLE "SocialAccount" (id text PRIMARY KEY, "organizationId" text, platform text, name text, avatar text);
            CREATE TABLE "Comment" (id text PRIMARY KEY, "organizationId" text, "socialAccountId" text,
                "createdAt" timestamp, "authorId" text, "authorUsername" text, "authorAvatar" text, text text,
                "isRead" boolean DEFAULT false, "assignedToId" text, "labelIds" text[] DEFAULT '{}',
                "parentId" text, "replyCount" int DEFAULT 0, sentiment text, "platformPostId" text, "platformCommentId" text, "isReplied" boolean DEFAULT false);
            CREATE TABLE "Mention" (LIKE "Comment" INCLUDING DEFAULTS); ALTER TABLE "Mention" ADD COLUMN type text;
            CREATE TABLE "Review" (id text PRIMARY KEY, "organizationId" text, "socialAccountId" text,
                "createdAt" timestamp, "authorName" text, "authorAvatar" text, text text, "isRead" boolean DEFAULT false,
                rating int, "platformReviewId" text, "isReplied" boolean DEFAULT false, "replyText" text, "reviewUrl" text);
            CREATE TABLE "DirectMessage" (id text PRIMARY KEY, "organizationId" text, "socialAccountId" text,
                "createdAt" timestamp, "conversationId" text, "platformMessageId" text, direction text,
                "senderId" text, "senderUsername" text, "senderAvatar" text, text text, "isRead" boolean DEFAULT false,
                "assignedToId" text, "labelIds" text[] DEFAULT '{}');
            INSERT INTO "Organization" VALUES ('org'), ('foreign');
            INSERT INTO "SocialAccount" VALUES ('a', 'org', 'INSTAGRAM', 'A', null), ('b', 'org', 'FACEBOOK', 'B', null), ('foreign', 'foreign', 'INSTAGRAM', 'Foreign', null);
            INSERT INTO "DirectMessage" (id, "organizationId", "socialAccountId", "createdAt", "conversationId", direction, "senderId", "senderUsername", text, "assignedToId", "labelIds") VALUES
                ('a-in', 'org', 'a', '2026-09-01', 'same-thread', 'inbound', 'alice', 'Alice', 'needle', null, '{}'),
                ('a-out', 'org', 'a', '2026-09-02', 'same-thread', 'outbound', 'us', 'You', 'answer', 'member', '{label}'),
                ('b-in', 'org', 'b', '2026-09-03', 'same-thread', 'inbound', 'bob', 'Bob', 'hello', null, '{}'),
                ('foreign-in', 'foreign', 'foreign', '2026-09-04', 'same-thread', 'inbound', 'secret', 'Secret', 'needle', null, '{}');
            INSERT INTO "Review" (id, "organizationId", "socialAccountId", "createdAt", "authorName", rating) VALUES
                ('review', 'org', 'b', '2026-09-05', 'Reviewer', 5);
            INSERT INTO "Comment" (id, "organizationId", "socialAccountId", "createdAt", "authorUsername", text, sentiment)
                SELECT 'c' || n, 'org', 'a', '2026-08-01'::timestamp + n * interval '1 day', 'Commenter', 'text', 'negative' FROM generate_series(1,35) n;
            INSERT INTO "Comment" (id, "organizationId", "socialAccountId", "createdAt", "parentId") VALUES ('reply', 'org', 'a', '2026-09-11', 'c1');
        `);
        await connection.exec(await readFile(resolve('prisma/migrations/20260912120000_add_inbox_workflow/migration.sql'), 'utf8'));
    }, 30000);
    afterAll(async () => {
        if (connection) { await connection.exec(`DROP SCHEMA ${schema} CASCADE`); await connection.close(); }
    });

    it('counts account+conversation groups and globally sorts before paginating', async () => {
        const first = await list();
        const second = await list({ page: 2 });
        expect(first.total).toBe(38);
        expect(first.counts).toEqual({ comments: 35, mentions: 0, dms: 2, reviews: 1 });
        expect(await attentionCount()).toBe((await list({ queue: 'open' })).total);
        expect(first.data[0].id).toBe('c1');
        expect(first.data).toHaveLength(30);
        expect(second.data).toHaveLength(8);
        expect(new Set([...first.data, ...second.data].map((r) => r.id)).size).toBe(38);
        expect((await list({ page: 3 })).total).toBe(38);
        expect((await list({ page: 3 })).data).toEqual([]);
    });

    it('searching an older DM keeps the latest preview and full unread/message totals', async () => {
        const result = await list({ type: 'dm', q: 'needle', isRead: 'false' });
        expect(result.total).toBe(1);
        expect(result.counts.dms).toBe(1);
        expect(result.data[0]).toMatchObject({ id: 'a-out', text: 'You: answer', authorUsername: 'Alice',
            messageCount: 2, unreadCount: 1, isRead: false, socialAccountId: 'a', socialAccount: { id: 'a' },
            workflow: { status: 'open', assignedToId: 'member', labelIds: ['label'] } });
        expect((await list({ type: 'dm', isRead: 'true' })).total).toBe(0);
        expect((await list({ type: 'dm', socialAccountId: 'b' })).data[0].authorUsername).toBe('Bob');
    });

    it('uses identical search, account, platform, sentiment and assignment filters for counts', async () => {
        expect((await list({ q: 'missing' })).total).toBe(0);
        expect((await list({ socialAccountId: 'foreign' })).total).toBe(0);
        expect((await list({ platform: 'facebook', sentiment: 'positive' })).data[0]).toMatchObject({
            id: 'review', type: 'review', meta: { rating: 5, reviewId: 'review' }, workflow: { status: 'open' },
        });
        expect((await list({ sentiment: 'negative' })).total).toBe(35);
        expect((await list({ queue: 'mine', label: 'label' })).total).toBe(1);
    });

    it('workflow survives new latest messages and snoozes expire independently of read state', async () => {
        await connection.exec(`UPDATE "InboxWorkflow" SET status = 'SNOOZED', "snoozedUntil" = '2026-09-13' WHERE type = 'DM';
            INSERT INTO "DirectMessage" (id, "organizationId", "socialAccountId", "createdAt", "conversationId", direction, "senderId", "senderUsername", text)
            VALUES ('a-new', 'org', 'a', '2026-09-12', 'same-thread', 'inbound', 'alice', 'Alice', 'new message');`);
        expect((await list({ queue: 'snoozed' })).data[0]).toMatchObject({ id: 'a-new', workflow: { status: 'snoozed', assignedToId: 'member', labelIds: ['label'] } });
        expect((await list({ queue: 'mine' })).total).toBe(0);
        expect(await attentionCount()).toBe(37);
        await connection.exec(`UPDATE "InboxWorkflow" SET "snoozedUntil" = '2026-09-12 12:00:00';`);
        expect((await list({ queue: 'snoozed' })).total).toBe(0);
        expect((await list({ queue: 'mine' })).data[0].workflow.status).toBe('open');
        expect(await attentionCount()).toBe(38);
        await connection.exec(`UPDATE "InboxWorkflow" SET status = 'RESOLVED', "snoozedUntil" = NULL;`);
        expect((await list({ queue: 'resolved', isRead: 'false' })).total).toBe(1);
        expect(await attentionCount()).toBe(37);
    });

    it('has no badge when every conversation is resolved despite unread rows and replies', async () => {
        await connection.exec('BEGIN');
        try {
            await connection.exec(`INSERT INTO "InboxWorkflow"
                (id, "organizationId", "socialAccountId", type, "entityId", status, "updatedAt")
                SELECT 'badge-' || id, 'org', "socialAccountId", 'COMMENT', id, 'RESOLVED', now()
                FROM "Comment" WHERE "organizationId" = 'org' AND "parentId" IS NULL;
                INSERT INTO "InboxWorkflow"
                (id, "organizationId", "socialAccountId", type, "entityId", status, "updatedAt") VALUES
                ('badge-dm', 'org', 'b', 'DM', 'same-thread', 'RESOLVED', now()),
                ('badge-review', 'org', 'b', 'REVIEW', 'review', 'RESOLVED', now());
                UPDATE "InboxWorkflow" SET status = 'RESOLVED' WHERE "organizationId" = 'org';`);
            expect((await list({ queue: 'all', isRead: 'false' })).total).toBe(38);
            expect((await list({ queue: 'open' })).total).toBe(0);
            expect(await attentionCount()).toBe(0);
        } finally { await connection.exec('ROLLBACK'); }
    });

    it('aggregates exact canonical workload, boundary ages, effective snoozes and tenant-safe assignee names', async () => {
        await connection.exec('BEGIN');
        try {
            await connection.exec(`DELETE FROM "InboxWorkflow"; DELETE FROM "Comment"; DELETE FROM "Mention";
                DELETE FROM "Review"; DELETE FROM "DirectMessage";
                INSERT INTO "User" VALUES ('member', 'Member'), ('removed', 'Private foreign name');
                INSERT INTO "OrganizationMember" VALUES ('org', 'member'), ('foreign', 'removed');
                INSERT INTO "Comment" (id,"organizationId","socialAccountId","createdAt","assignedToId","parentId") VALUES
                    ('root', 'org', 'a', '2026-01-01', 'member', NULL),
                    ('reply', 'org', 'a', '2026-09-12 11:00', NULL, 'root'),
                    ('24', 'org', 'a', '2026-09-11 12:00', NULL, NULL),
                    ('72', 'org', 'a', '2026-09-09 12:00', 'deleted', NULL),
                    ('expired-snooze', 'org', 'a', '2026-09-08 08:00', 'removed', NULL),
                    ('foreign-reply', 'foreign', 'a', '2026-10-01', NULL, '72'),
                    ('other-account-reply', 'org', 'b', '2026-10-01', NULL, '72'),
                    ('wrong-account-org', 'org', 'foreign', '2026-01-01', NULL, NULL),
                    ('foreign-root', 'foreign', 'foreign', '2026-01-01', NULL, NULL);
                INSERT INTO "Mention" (id,"organizationId","socialAccountId","createdAt","assignedToId") VALUES
                    ('25', 'org', 'a', '2026-09-11 11:00', 'member'),
                    ('future', 'org', 'a', '2026-09-13', NULL),
                    ('24plus', 'org', 'a', '2026-09-11 11:59:59.999', 'deleted');
                INSERT INTO "DirectMessage" (id,"organizationId","socialAccountId","createdAt","conversationId",direction,"assignedToId") VALUES
                    ('a-old', 'org', 'a', '2026-01-01', 'thread', 'inbound', 'member'),
                    ('a-latest', 'org', 'a', '2026-09-09 11:00', 'thread', 'outbound', 'member'),
                    ('b-latest', 'org', 'b', '2026-09-08 18:00', 'thread', 'inbound', NULL);
                INSERT INTO "Review" (id,"organizationId","socialAccountId","createdAt",rating) VALUES
                    ('resolved-review', 'org', 'b', '2026-01-01', 5);
                INSERT INTO "InboxWorkflow" (id,"organizationId","socialAccountId",type,"entityId",status,"snoozedUntil","assignedToId","updatedAt") VALUES
                    ('wa', 'org', 'a', 'DM', 'thread', 'SNOOZED', '2026-09-12 12:00', NULL, now()),
                    ('wb', 'org', 'b', 'DM', 'thread', 'SNOOZED', '2026-09-12 12:00:00.001', NULL, now()),
                    ('wr', 'org', 'b', 'REVIEW', 'resolved-review', 'RESOLVED', NULL, NULL, now()),
                    ('wn', 'org', 'a', 'COMMENT', 'expired-snooze', 'SNOOZED', '2026-09-11', 'removed', now());`);
            const data = await report();
            expect(Object.keys(data).sort()).toEqual(['ageBuckets', 'byAssignee', 'byType', 'generatedAt', 'summary']);
            expect(data.generatedAt).toBe(now.toISOString());
            expect(data.summary).toEqual({ open: 8, resolved: 1, snoozed: 1, unassignedOpen: 3,
                openOlderThan24h: 5, openOlderThan72h: 2 });
            expect(data.byType).toEqual([
                { type: 'comment', open: 4, resolved: 0, snoozed: 0 },
                { type: 'mention', open: 3, resolved: 0, snoozed: 0 },
                { type: 'dm', open: 1, resolved: 0, snoozed: 1 },
                { type: 'review', open: 0, resolved: 1, snoozed: 0 },
            ]);
            expect(data.byAssignee).toEqual([
                { userId: null, name: 'Unassigned', open: 3, olderThan24h: 1 },
                { userId: 'deleted', name: 'Deleted assignee', open: 2, olderThan24h: 2 },
                { userId: 'member', name: 'Member', open: 2, olderThan24h: 1 },
                { userId: 'removed', name: 'Deleted assignee', open: 1, olderThan24h: 1 },
            ]);
            expect(data.ageBuckets).toEqual([
                { key: 'under24h', label: 'Under 24 hours', count: 2 },
                { key: '24to72h', label: '24–72 hours', count: 4 },
                { key: 'over72h', label: 'Over 72 hours', count: 2 },
            ]);
            for (const params of [{}, { socialAccountId: 'a' }, { platform: 'facebook' }, { socialAccountId: 'a', platform: 'facebook' }, { socialAccountId: 'foreign' }]) {
                const snapshot = await report(params);
                for (const queue of ['open', 'resolved', 'snoozed'] as const) {
                    expect(snapshot.summary[queue]).toBe((await list({ ...params, queue })).total);
                    for (const row of snapshot.byType) {
                        expect(row[queue]).toBe((await list({ ...params, queue, type: row.type })).total);
                    }
                }
            }
            const empty = await report({ socialAccountId: "' OR TRUE --" });
            expect(empty.summary).toEqual({ open: 0, resolved: 0, snoozed: 0, unassignedOpen: 0, openOlderThan24h: 0, openOlderThan72h: 0 });
            expect(empty.byAssignee).toEqual([{ userId: null, name: 'Unassigned', open: 0, olderThan24h: 0 }]);
            expect(empty.ageBuckets.every((b) => b.count === 0)).toBe(true);
        } finally { await connection.exec('ROLLBACK'); }
    });
});
