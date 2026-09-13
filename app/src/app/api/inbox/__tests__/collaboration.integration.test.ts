// @vitest-environment node
/** Uses the same disposable database / external PGlite configuration as query.integration.test.ts. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client, Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { cursorScope, decodeCursor, historyPage, historyWhere } from '../collaboration/pagination';

const enabled = Boolean(process.env.INBOX_TEST_DATABASE_URL || process.env.INBOX_TEST_PGLITE_MODULE);
let connection: { query: (sql: string, values?: unknown[], options?: object) => Promise<{ rows: unknown[]; affectedRows?: number }>;
    exec: (sql: string) => Promise<unknown>; close: () => Promise<unknown> };
let prisma: PrismaClient;
let pool: Pool;
const schema = `collaboration_test_${Date.now()}`;
const note = (id: string, org = 'org', author = 'author', request = '7a7b8172-1de8-4f73-9a80-555de4a025a3') => `INSERT INTO "InboxNote" (id,"organizationId","workflowId","authorId","authorName","requestId",body,mentions) VALUES ('${id}','${org}','workflow','${author}','Author','${request}','private','[]')`;
describe.skipIf(!enabled)('collaboration migration constraints and atomicity', () => {
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
            CREATE TABLE "Organization" (id TEXT PRIMARY KEY);
            CREATE TABLE "SocialAccount" (id TEXT PRIMARY KEY);
            CREATE TABLE "Notification" (id TEXT PRIMARY KEY, "userId" TEXT NOT NULL);
            CREATE TABLE "Comment" (id TEXT, "organizationId" TEXT, "socialAccountId" TEXT, "assignedToId" TEXT, "labelIds" TEXT[]);
            CREATE TABLE "Mention" (LIKE "Comment");
            CREATE TABLE "DirectMessage" (LIKE "Comment", "conversationId" TEXT, "createdAt" TIMESTAMP);
            INSERT INTO "Organization" VALUES ('org'), ('foreign'); INSERT INTO "SocialAccount" VALUES ('account');`);
        for (const migration of ['20260912120000_add_inbox_workflow', '20260913120000_add_inbox_collaboration']) {
            await connection.exec(await readFile(resolve(`prisma/migrations/${migration}/migration.sql`), 'utf8'));
        }
        await connection.exec(`INSERT INTO "InboxWorkflow" (id,"organizationId","socialAccountId",type,"entityId","updatedAt") VALUES ('workflow','org','account','DM','thread',now());`);
        pool = new Pool({ connectionString: process.env.INBOX_TEST_DATABASE_URL });
        if (process.env.INBOX_TEST_PGLITE_MODULE) {
            // Run Prisma's actual generated keyset SQL in PGlite through the pg adapter.
            // Preserve pg's array row mode and timestamp/JSON text parsers for Prisma.
            Object.defineProperty(pool, 'query', { value: async (config: { text: string; values: unknown[];
                types: { getTypeParser: (oid: number, format: string) => (value: string) => unknown } }) => {
                const parsers = Object.fromEntries([1114, 1184, 114, 3802].map((oid) => [oid, config.types.getTypeParser(oid, 'text')]));
                const result = await connection.query(config.text, config.values, { rowMode: 'array', parsers });
                return { ...result, rowCount: result.affectedRows ?? 0 };
            } });
        }
        prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
    }, 30000);
    afterAll(async () => {
        await prisma?.$disconnect();
        await pool?.end();
        if (connection) { await connection.exec(`DROP SCHEMA ${schema} CASCADE`); await connection.close(); }
    });
    it('enforces composite tenant ownership and author/workflow UUID uniqueness', async () => {
        await expect(connection.exec(note('foreign-note', 'foreign'))).rejects.toThrow();
        await connection.exec(note('one'));
        await expect(connection.exec(note('duplicate', 'org', 'author', '7A7B8172-1DE8-4F73-9A80-555DE4A025A3'))).rejects.toThrow();
        await connection.exec(note('another-author', 'org', 'other'));
        expect((await connection.query('SELECT id FROM "InboxNote"')).rows).toHaveLength(2);
    });
    it('rolls back note/history/notifications if a recipient write fails', async () => {
        await connection.exec('BEGIN');
        await connection.exec(note('rollback', 'org', 'rollback-author'));
        await connection.exec(`INSERT INTO "InboxActivity" (id,"organizationId","workflowId","actorId","actorName",kind,description) VALUES ('activity','org','workflow','author','Author','note','Added an internal note')`);
        await connection.exec(`INSERT INTO "Notification" VALUES ('good','recipient')`);
        await expect(connection.exec(`INSERT INTO "Notification" VALUES ('bad',NULL)`)).rejects.toThrow();
        await connection.exec('ROLLBACK');
        expect((await connection.query(`SELECT id FROM "InboxNote" WHERE id = 'rollback'`)).rows).toEqual([]);
        expect((await connection.query('SELECT id FROM "InboxActivity"')).rows).toEqual([]);
        expect((await connection.query('SELECT id FROM "Notification"')).rows).toEqual([]);
    });
    it('paginates actual Prisma keysets across timestamp ties, insertions, deleted anchors and tenant/workflow scopes', async () => {
        await connection.exec(`DELETE FROM "InboxNote";
            INSERT INTO "InboxWorkflow" (id,"organizationId","socialAccountId",type,"entityId","updatedAt") VALUES
                ('other-workflow','org','account','DM','other',now()), ('foreign-workflow','foreign','account','DM','thread',now());
            INSERT INTO "InboxNote" (id,"organizationId","workflowId","authorId","authorName","requestId",body,mentions,"createdAt")
                SELECT 'n' || lpad(n::text, 3, '0'), 'org', 'workflow', 'author' || n, 'Author',
                    '7a7b8172-1de8-4f73-9a80-555de4a025a3', 'private', '[]',
                    CASE WHEN n > 30 THEN '2026-09-13'::timestamp ELSE '2026-09-12'::timestamp END
                FROM generate_series(1,121) n;
            INSERT INTO "InboxActivity" (id,"organizationId","workflowId","actorId","actorName",kind,description,"createdAt")
                SELECT 'a' || lpad(n::text, 3, '0'), 'org', 'workflow', 'author', 'Author', 'note', 'Added an internal note', '2026-09-13'
                FROM generate_series(1,103) n;
            INSERT INTO "InboxNote" (id,"organizationId","workflowId","authorId","authorName","requestId",body,mentions,"createdAt") VALUES
                ('other-note', 'org', 'other-workflow', 'author', 'Author', '7a7b8172-1de8-4f73-9a80-555de4a025a3', 'hidden', '[]', '2026-09-13'),
                ('foreign-note', 'foreign', 'foreign-workflow', 'author', 'Author', '7a7b8172-1de8-4f73-9a80-555de4a025a3', 'secret', '[]', '2026-09-13');
            INSERT INTO "InboxActivity" (id,"organizationId","workflowId","actorId","actorName",kind,description,"createdAt") VALUES
                ('foreign-activity', 'foreign', 'foreign-workflow', 'author', 'Author', 'status', 'secret', '2026-09-13'),
                ('other-activity', 'org', 'other-workflow', 'author', 'Author', 'status', 'hidden', '2026-09-13');`);
        const key = { organizationId: 'org', socialAccountId: 'account', type: 'DM', entityId: 'thread' };
        async function page(stream: 'notes' | 'activity', cursor?: string) {
            const scope = cursorScope(key, stream);
            const args = { where: historyWhere('org', 'workflow', decodeCursor(cursor, scope)),
                orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }], take: 51 };
            const rows = stream === 'notes' ? await prisma.inboxNote.findMany(args) : await prisma.inboxActivity.findMany(args);
            return historyPage<{ id: string; createdAt: Date }>(rows, scope);
        }
        for (const stream of ['notes', 'activity'] as const) {
            const first = await page(stream);
            expect(first.items).toHaveLength(50);
            const expectedCount = stream === 'notes' ? 121 : 103;
            expect(first.items[0].id).toBe(stream === 'notes' ? 'n121' : 'a103');
            // Deleting the last delivered row must not invalidate the cursor.
            if (stream === 'notes') {
                await prisma.inboxNote.delete({ where: { id: first.items[49].id } });
                await prisma.inboxNote.create({ data: { id: 'new-note', organizationId: 'org', workflowId: 'workflow',
                    authorId: 'new', authorName: 'New', requestId: '7a7b8172-1de8-4f73-9a80-555de4a025a3', body: 'new', mentions: [], createdAt: new Date('2026-09-14') } });
            } else {
                await prisma.inboxActivity.delete({ where: { id: first.items[49].id } });
                await prisma.inboxActivity.create({ data: { id: 'new-activity', organizationId: 'org', workflowId: 'workflow',
                    actorId: 'new', actorName: 'New', kind: 'note', description: 'new', createdAt: new Date('2026-09-14') } });
            }
            const second = await page(stream, first.nextCursor!);
            const third = await page(stream, second.nextCursor!);
            expect(second.items).toHaveLength(50);
            expect(third.items).toHaveLength(expectedCount - 100);
            expect(third.nextCursor).toBeNull();
            const ids = [...first.items, ...second.items, ...third.items].map((r) => r.id);
            expect(new Set(ids).size).toBe(expectedCount);
            expect(ids.every((id) => /^[na]\d{3}$/.test(id))).toBe(true);
        }
    });
});
