// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

const mocks = vi.hoisted(() => ({
    key: vi.fn(), member: vi.fn(), reserve: vi.fn(), existing: vi.fn(), save: vi.fn(),
    account: vi.fn(), media: vi.fn(), post: vi.fn(), activity: vi.fn(), create: vi.fn(), rate: vi.fn(),
    findPost: vi.fn(), listPosts: vi.fn(), writePost: vi.fn(), replaceSchedule: vi.fn(), deletePost: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: {
    publishingApiKey: { findUnique: mocks.key }, organizationMember: { findUnique: mocks.member },
    publishingRequest: { createMany: mocks.reserve, findUniqueOrThrow: mocks.existing, update: mocks.save },
    socialAccount: { findFirst: mocks.account, findMany: vi.fn().mockResolvedValue([]) },
    media: { count: mocks.media, findMany: vi.fn().mockResolvedValue([]) },
    post: { findFirstOrThrow: mocks.post, findFirst: mocks.post, findUnique: mocks.findPost, findMany: mocks.listPosts, delete: mocks.deletePost },
    $transaction: (run: (tx: unknown) => unknown) => run({ post: { update: mocks.writePost } }),
    activity: { create: mocks.activity },
} }));
vi.mock('@/lib/posts-service', () => ({ createPosts: mocks.create }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.rate }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/queue', () => ({
    withPostPublishLock: async (_id: string, run: () => unknown) => run(),
    replacePostScheduleLocked: mocks.replaceSchedule,
}));
vi.mock('@/lib/cache', () => ({ invalidatePostCaches: vi.fn() }));
vi.mock('@/lib/services/platform-analytics-sync', () => ({}));
vi.mock('@/lib/schedule-conflicts', () => ({ findScheduleConflict: async () => null }));

import { authenticatePublishingKey, generatePublishingKey, hashKey, type PublishingPrincipal } from '../auth';
import { canonicalJson, createPublishingServer, publishImmediately, publishInput, toolResult } from '../server';
import { POST, GET } from '@/app/api/mcp/route';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const principal: PublishingPrincipal = { keyId: 'key1', organizationId: 'org1', userId: 'user1',
    userName: 'Publisher', canPublish: true, canRead: true, canReadMedia: true, canUpload: false, canReadAnalytics: false,
    canCreateDraft: false, canEditPost: false, canSchedulePost: false };
const input = () => ({ requestId: randomUUID(), accountId: 'account1', caption: 'Hello', mediaIds: [] });
const text = (result: ReturnType<typeof toolResult>) => JSON.parse(result.content[0].text);

beforeEach(() => {
    vi.resetAllMocks();
    mocks.key.mockResolvedValue({ id: 'key1', organizationId: 'org1', userId: 'user1',
        scopes: ['read', 'publish'], expiresAt: new Date(Date.now() + 60_000), revokedAt: null });
    mocks.member.mockResolvedValue({ organizationId: 'org1', role: 'OWNER', user: { name: 'Owner', bannedAt: null } });
    mocks.reserve.mockResolvedValue({ count: 1 });
    mocks.account.mockResolvedValue({ id: 'account1', platform: 'BLUESKY' });
    mocks.media.mockResolvedValue(0);
    mocks.create.mockResolvedValue({ status: 201, posts: [{ id: 'post1' }] });
    mocks.post.mockResolvedValue({ id: 'post1', status: 'SCHEDULED', platformPostId: null, publishedAt: null, errors: [] });
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.activity.mockResolvedValue({});
    mocks.writePost.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
});

describe('publishing credentials', () => {
    it('generates high entropy keys and only hashes the secret for storage', () => {
        const generated = generatePublishingKey();
        expect(generated.key).toMatch(/^osp_[a-f0-9]{64}$/);
        expect(generated.keyHash).toBe(hashKey(generated.key));
        expect(generated.keyHash).not.toContain(generated.key);
        expect(generatePublishingKey().key).not.toBe(generated.key);
    });
    it('does not accept session cookies or query-string keys', async () => {
        expect(await authenticatePublishingKey(new Request('http://localhost/api/mcp?key=secret', {
            headers: { Cookie: 'authjs.session-token=session' },
        }))).toBeNull();
        expect(mocks.key).not.toHaveBeenCalled();
    });
    it.each(['revoked', 'expired', 'banned', 'removed', 'downgraded'])('rejects %s access on the next request', async reason => {
        if (reason === 'revoked') mocks.key.mockResolvedValueOnce({ revokedAt: new Date() });
        if (reason === 'expired') mocks.key.mockResolvedValueOnce({ expiresAt: new Date(0) });
        if (reason === 'banned') mocks.member.mockResolvedValueOnce({ user: { bannedAt: new Date() } });
        if (reason === 'removed') mocks.member.mockResolvedValueOnce(null);
        if (reason === 'downgraded') mocks.member.mockResolvedValueOnce({ role: 'VIEWER', user: {}, organizationId: 'org1' });
        if (reason === 'downgraded') mocks.key.mockResolvedValueOnce({ id: 'key1', organizationId: 'org1', userId: 'user1', scopes: ['publish'], expiresAt: new Date(Date.now() + 60_000) });
        const key = generatePublishingKey().key;
        expect(await authenticatePublishingKey(new Request('http://localhost/api/mcp', { headers: { Authorization: `Bearer ${key}` } }))).toBeNull();
    });
    it('does not grant permissions through a foreign custom role', async () => {
        mocks.member.mockResolvedValueOnce({ organizationId: 'org1', role: 'CUSTOM', user: {},
            customRole: { organizationId: 'org2', permissions: [{ permission: { code: 'posts.publish' } }] } });
        expect(await authenticatePublishingKey(new Request('http://localhost/api/mcp', {
            headers: { Authorization: `Bearer ${generatePublishingKey().key}` },
        }))).toBeNull();
    });
    it('accepts media-only read permissions without granting account, analytics, or publish access', async () => {
        mocks.key.mockResolvedValueOnce({ id: 'key1', organizationId: 'org1', userId: 'user1', scopes: ['read'],
            expiresAt: new Date(Date.now() + 60_000) });
        mocks.member.mockResolvedValueOnce({ organizationId: 'org1', role: 'CUSTOM', user: {},
            customRole: { organizationId: 'org1', permissions: [{ permission: { code: 'media.view' } }] } });
        expect(await authenticatePublishingKey(new Request('http://localhost/api/mcp', {
            headers: { Authorization: `Bearer ${generatePublishingKey().key}` },
        }))).toMatchObject({ canReadMedia: true, canRead: false, canPublish: false, canUpload: false, canReadAnalytics: false });
    });
    it.each([
        { scopes: ['manage_posts'], grants: ['posts.create'], flags: [true, false, false] },
        { scopes: ['manage_posts'], grants: ['posts.edit'], flags: [false, true, false] },
        { scopes: ['read', 'manage_posts'], grants: ['accounts.view', 'posts.schedule', 'posts.publish'], flags: [false, false, false] },
        { scopes: ['read', 'publish', 'manage_posts'], grants: ['accounts.view', 'posts.schedule'], flags: [false, false, false] },
        { scopes: ['publish', 'manage_posts'], grants: ['posts.schedule', 'posts.publish'], flags: [false, false, true] },
    ])('uses current issuer grants and key scopes for post management ($scopes, $grants)', async ({ scopes, grants, flags }) => {
        mocks.key.mockResolvedValueOnce({ id: 'key1', organizationId: 'org1', userId: 'user1', scopes,
            expiresAt: new Date(Date.now() + 60_000) });
        mocks.member.mockResolvedValueOnce({ role: 'CUSTOM', user: {}, customRole: { organizationId: 'org1',
            permissions: grants.map(code => ({ permission: { code } })) } });
        const [canCreateDraft, canEditPost, canSchedulePost] = flags;
        expect(await authenticatePublishingKey(new Request('http://localhost/api/mcp', {
            headers: { Authorization: `Bearer ${generatePublishingKey().key}` },
        }))).toMatchObject({ canCreateDraft, canEditPost, canSchedulePost, canPublish: false });
    });
});

describe('immediate-only publishing', () => {
    it.each([{ scheduledAt: '2099-01-01' }, { autoPublish: false }, { settings: { autoPublish: false } },
        { settings: { mediaIds: ['foreign'] } }, { organizationId: 'foreign' }])('rejects unsupported overrides %j', extra => {
        expect(publishInput.safeParse({ ...input(), ...extra }).success).toBe(false);
    });
    it('cannot publish with a read-only credential', async () => {
        expect((await publishImmediately({ ...principal, canPublish: false }, input())).isError).toBe(true);
        expect(mocks.reserve).not.toHaveBeenCalled();
    });
    it('uses the existing publisher with forced immediate settings and tenant-scoped media/account checks', async () => {
        const result = await publishImmediately(principal, input());
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org1',
            platformAccountIds: ['account1'], autoPublish: true, scheduledAt: null }));
        expect(mocks.account).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org1', isActive: true }) }));
        expect(mocks.media).toHaveBeenCalledWith({ where: { id: { in: [] }, organizationId: 'org1' } });
        expect(text(result).message).toContain('not confirmation');
        expect(text(result).postId).toBe('post1');
    });
    it('rejects missing/disconnected/manual accounts before creation', async () => {
        mocks.account.mockResolvedValueOnce(null);
        expect((await publishImmediately(principal, input())).isError).toBe(true);
        expect(mocks.create).not.toHaveBeenCalled();
    });
    it('rejects foreign media before creating or queuing posts', async () => {
        expect((await publishImmediately(principal, { ...input(), mediaIds: ['foreign'] })).isError).toBe(true);
        expect(mocks.create).not.toHaveBeenCalled();
    });
    it('reports queue failure rather than claiming success', async () => {
        mocks.post.mockResolvedValueOnce({ status: 'DRAFT' });
        const result = await publishImmediately(principal, input());
        expect(result.isError).toBe(true);
        expect(text(result).message).toContain('Queueing failed');
    });
    it.each(['SCHEDULED', 'DRAFT'])('persists and replays a known %s outcome even when audit logging fails', async status => {
        const operation = input();
        mocks.post.mockResolvedValueOnce({ status });
        mocks.activity.mockRejectedValueOnce(new Error('Audit database unavailable'));
        const result = await publishImmediately(principal, operation);
        expect(text(result)).toMatchObject({ postId: 'post1', requestId: operation.requestId, status: status.toLowerCase() });
        expect(result.isError).toBe(status === 'DRAFT');
        expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.activity.mock.invocationCallOrder[0]);

        const { requestId: _requestId, ...payload } = publishInput.parse(operation);
        mocks.reserve.mockResolvedValueOnce({ count: 0 });
        mocks.existing.mockResolvedValueOnce({ payloadHash: hashKey(canonicalJson(payload)),
            result: mocks.save.mock.calls[0][0].data.result });
        expect(await publishImmediately(principal, operation)).toEqual(result);
        expect(mocks.create).toHaveBeenCalledTimes(1);
        expect(mocks.activity).toHaveBeenCalledTimes(1);
    });
    it('does not log a completed publish before its result is durable', async () => {
        mocks.save.mockRejectedValueOnce(new Error('Result write failed'));
        await expect(publishImmediately(principal, input())).rejects.toThrow('Result write failed');
        expect(mocks.activity).not.toHaveBeenCalled();
    });
    it('replays a completed request without creating another post', async () => {
        const parsed = publishInput.parse(input());
        const { requestId: _requestId, ...payload } = parsed;
        mocks.reserve.mockResolvedValueOnce({ count: 0 });
        const previous = toolResult({ postId: 'original' });
        mocks.existing.mockResolvedValueOnce({ payloadHash: hashKey(canonicalJson(payload)), result: JSON.stringify(previous) });
        expect(await publishImmediately(principal, parsed)).toEqual(previous);
        expect(mocks.create).not.toHaveBeenCalled();
    });
    it('never repeats an interrupted/in-flight operation or reuses an id with different input', async () => {
        const parsed = publishInput.parse(input());
        const { requestId: _requestId, ...payload } = parsed;
        mocks.reserve.mockResolvedValue({ count: 0 });
        mocks.existing.mockResolvedValue({ payloadHash: hashKey(canonicalJson(payload)), result: null });
        expect(text(await publishImmediately(principal, parsed)).error).toContain('uncertain');
        expect(text(await publishImmediately(principal, { ...parsed, caption: 'changed' })).error).toContain('different input');
        expect(mocks.create).not.toHaveBeenCalled();
    });
    it('normalizes key order in retry payloads', () => {
        expect(canonicalJson({ b: 2, a: { y: 1, x: 2 } })).toBe(canonicalJson({ a: { x: 2, y: 1 }, b: 2 }));
    });
});

describe('MCP Streamable HTTP', () => {
    it('creates, edits, and schedules an opted-in workspace draft without offering deletion', async () => {
        mocks.key.mockResolvedValue({ id: 'key1', organizationId: 'org1', userId: 'user1',
            scopes: ['read', 'publish', 'manage_posts'], expiresAt: new Date(Date.now() + 60_000) });
        const draft = { id: 'post1', organizationId: 'org1', status: 'DRAFT', caption: 'Hello',
            socialAccountId: 'account1', platform: 'BLUESKY', postType: 'FEED', autoPublish: false,
            scheduledAt: null, media: [], pillarId: 'pillar1' };
        mocks.findPost.mockResolvedValue(draft);
        mocks.listPosts.mockResolvedValue([draft]);
        const client = new Client({ name: 'post-manager', version: '1.0.0' });
        const transport = new StreamableHTTPClientTransport(new URL('http://localhost/api/mcp'), {
            requestInit: { headers: { Authorization: `Bearer ${generatePublishingKey().key}` } },
            fetch: async (url, init) => POST(new Request(url, init)),
        });
        try {
            await client.connect(transport);
            const names = (await client.listTools()).tools.map(tool => tool.name);
            expect(names).toEqual(expect.arrayContaining(['create_draft', 'edit_post', 'schedule_post', 'list_unpublished_posts']));
            expect(names.some(name => name.includes('delete'))).toBe(false);
            const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args });
            const draftInput = input();
            expect((await call('create_draft', draftInput)).isError).toBe(false);
            expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ autoPublish: false, scheduledAt: null }));
            const stored = mocks.save.mock.lastCall![0].data.result;
            mocks.reserve.mockResolvedValueOnce({ count: 0 });
            const { requestId: _requestId, ...payload } = publishInput.parse(draftInput);
            mocks.existing.mockResolvedValueOnce({ payloadHash: hashKey(canonicalJson({ operation: 'create_draft', payload })), result: stored });
            expect((await call('create_draft', draftInput)).isError).toBe(false);
            expect(mocks.create).toHaveBeenCalledTimes(1);
            expect((await call('list_unpublished_posts', {})).isError).toBe(false);
            expect(mocks.listPosts).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org1' }) }));

            const update = () => ({ requestId: randomUUID(), postId: 'post1' });
            expect((await call('edit_post', { ...update(), firstComment: 'Comment' })).isError).toBe(false);
            expect(mocks.writePost).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({
                caption: 'Hello', firstComment: 'Comment', pillarId: 'pillar1', status: 'DRAFT', autoPublish: false, scheduledAt: null,
            }) }));
            expect((await call('edit_post', { ...update(), mediaIds: ['foreign'] })).isError).toBe(true);
            expect((await call('edit_post', { ...update(), caption: 'Change', autoPublish: true })).isError).toBe(true);
            expect((await call('schedule_post', { ...update(), scheduledAt: '2000-01-01T12:00:00Z' })).isError).toBe(true);
            expect(mocks.replaceSchedule).not.toHaveBeenCalled();
            const nextTime = '2099-01-01T12:00:00+02:00';
            expect((await call('schedule_post', { ...update(), scheduledAt: nextTime })).isError).toBe(false);
            expect(mocks.replaceSchedule).toHaveBeenCalledWith('post1', 'org1', expect.objectContaining({
                scheduledAt: new Date(nextTime), autoPublish: true,
            }));
            mocks.findPost.mockResolvedValueOnce({ ...draft, status: 'SCHEDULED', scheduledAt: new Date(nextTime), autoPublish: true });
            expect((await call('edit_post', { ...update(), caption: 'Scheduled edit' })).isError).toBe(false);
            expect(mocks.replaceSchedule).toHaveBeenCalledTimes(1);
            for (const post of [{ ...draft, status: 'PUBLISHED' }, { ...draft, status: 'PUBLISHING' },
                { ...draft, organizationId: 'foreign' }, { ...draft, platformPostId: 'external' },
                { ...draft, status: 'SCHEDULED' }]) {
                mocks.findPost.mockResolvedValueOnce(post);
                expect((await call('edit_post', { ...update(), caption: 'No' })).isError).toBe(true);
                mocks.findPost.mockResolvedValueOnce(post);
                expect((await call('schedule_post', { ...update(), scheduledAt: nextTime })).isError).toBe(true);
            }
            expect(mocks.writePost).toHaveBeenCalledTimes(3);
            expect((await call('delete_post', { postId: 'post1' })).isError).toBe(true);
            expect(mocks.deletePost).not.toHaveBeenCalled();
        } finally { await client.close(); }
    });
    it('limits a media-only read key to media tools over the real SDK', async () => {
        mocks.key.mockResolvedValue({ id: 'key1', organizationId: 'org1', userId: 'user1', scopes: ['read'],
            expiresAt: new Date(Date.now() + 60_000) });
        mocks.member.mockResolvedValue({ organizationId: 'org1', role: 'CUSTOM', user: {},
            customRole: { organizationId: 'org1', permissions: [{ permission: { code: 'media.view' } }] } });
        const client = new Client({ name: 'media-reader', version: '1.0.0' });
        const transport = new StreamableHTTPClientTransport(new URL('http://localhost/api/mcp'), {
            requestInit: { headers: { Authorization: `Bearer ${generatePublishingKey().key}` } },
            fetch: async (url, init) => POST(new Request(url, init)),
        });
        try {
            await client.connect(transport);
            expect((await client.listTools()).tools.map(tool => tool.name).sort()).toEqual(['get_media_status', 'list_media']);
            expect((await client.callTool({ name: 'list_media', arguments: {} })).isError).toBe(false);
            expect((await client.callTool({ name: 'publish_now', arguments: input() })).isError).toBe(true);
            expect(mocks.create).not.toHaveBeenCalled();
        } finally { await client.close(); }
    });
    it('rejects unauthenticated and foreign-origin requests and does not offer GET SSE', async () => {
        expect((await POST(new Request('http://localhost/api/mcp', { method: 'POST' }))).status).toBe(401);
        expect((await POST(new Request('http://localhost/api/mcp', { method: 'POST', headers: { Origin: 'https://evil.example' } }))).status).toBe(403);
        expect((await GET()).status).toBe(405);
    });
    it('honors per-key fail-closed rate limits', async () => {
        mocks.rate.mockResolvedValueOnce({ allowed: false });
        expect((await POST(new Request('http://localhost/api/mcp', { method: 'POST',
            headers: { Authorization: `Bearer ${generatePublishingKey().key}` } }))).status).toBe(429);
    });
    it('initializes, discovers tools, publishes, and checks status with the real SDK client', async () => {
        const client = new Client({ name: 'integration-test', version: '1.0.0' });
        const transport = new StreamableHTTPClientTransport(new URL('http://localhost/api/mcp'), {
            requestInit: { headers: { Authorization: `Bearer ${generatePublishingKey().key}` } },
            fetch: async (url, init) => POST(new Request(url, init)),
        });
        try {
            await client.connect(transport);
            const tools = await client.listTools();
            expect(tools.tools.map(tool => tool.name).sort()).toEqual(['get_account_growth', 'get_analytics_summary',
                'get_media_status', 'get_post_analytics', 'get_publishing_status', 'get_top_posts',
                'list_accounts', 'list_media', 'publish_now']);
            const result = await client.callTool({ name: 'publish_now', arguments: input() });
            expect(result.isError).toBe(false);
            const status = await client.callTool({ name: 'get_publishing_status', arguments: { postId: 'post1' } });
            expect(status.isError).toBe(false);
            expect(mocks.post).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 'post1', organizationId: 'org1' } }));
            const bad = await client.callTool({ name: 'publish_now', arguments: { ...input(), scheduledAt: '2099-01-01' } });
            expect(bad.isError).toBe(true);
            mocks.post.mockResolvedValueOnce(null);
            const foreign = await client.callTool({ name: 'get_publishing_status', arguments: { postId: 'foreign' } });
            expect(foreign.isError).toBe(true);
            mocks.create.mockRejectedValueOnce(new Error('Internal database detail that must not be exposed'));
            const failed = await client.callTool({ name: 'publish_now', arguments: input() });
            expect(failed.isError).toBe(true);
            expect(JSON.stringify(failed)).not.toContain('Internal database detail');
        } finally { await client.close(); }
    });
    it('does not advertise or permit publish tools to read-only keys', async () => {
        mocks.key.mockResolvedValue({ id: 'reader', organizationId: 'org1', userId: 'user1',
            scopes: ['read'], expiresAt: new Date(Date.now() + 60_000) });
        const client = new Client({ name: 'reader', version: '1.0.0' });
        const transport = new StreamableHTTPClientTransport(new URL('http://localhost/api/mcp'), {
            requestInit: { headers: { Authorization: `Bearer ${generatePublishingKey().key}` } },
            fetch: async (url, init) => POST(new Request(url, init)),
        });
        try {
            await client.connect(transport);
            expect((await client.listTools()).tools.map(tool => tool.name)).not.toContain('publish_now');
            const result = await client.callTool({ name: 'publish_now', arguments: input() });
            expect(result.isError).toBe(true);
            expect(mocks.create).not.toHaveBeenCalled();
        } finally { await client.close(); }
    });
    it('enforces the body size limit before parsing', async () => {
        const result = await POST(new Request('http://localhost/api/mcp', { method: 'POST',
            headers: { Authorization: `Bearer ${generatePublishingKey().key}`, 'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream' },
            body: JSON.stringify({ oversized: 'x'.repeat(129 * 1024) }),
        }));
        expect(result.status).toBe(413);
        expect(mocks.create).not.toHaveBeenCalled();
    });
    it('constructs an isolated server for read-only keys', async () => {
        const server = createPublishingServer({ ...principal, canPublish: false });
        expect(server).toBeDefined();
        await server.close();
    });
});
