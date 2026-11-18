// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
const mocks = vi.hoisted(() => ({ key: vi.fn(), member: vi.fn(), upload: vi.fn(), rate: vi.fn(), activity: vi.fn(),
    media: vi.fn(), createPosts: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {
    publishingApiKey: { findUnique: mocks.key }, organizationMember: { findUnique: mocks.member },
    activity: { create: mocks.activity }, media: { findFirst: mocks.media, count: vi.fn().mockResolvedValue(1) },
    socialAccount: { findFirst: vi.fn().mockResolvedValue({ id: 'account1' }) },
    publishingRequest: { createMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn() },
    post: { findFirstOrThrow: mocks.post },
} }));
vi.mock('@/lib/media/upload-service', () => ({ uploadMedia: mocks.upload }));
vi.mock('@/lib/rate-limit', async importOriginal => ({
    ...await importOriginal<typeof import('@/lib/rate-limit')>(), checkRateLimit: mocks.rate,
}));
vi.mock('@/lib/posts-service', () => ({ createPosts: mocks.createPosts }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { decodeUpload, uploadInput, uploadInline, storeMcpUpload, mediaUploadConfig, MAX_MCP_FILE_BYTES, validateMcpFilename } from '../uploads';
import { authenticatePublishingKey, generatePublishingKey, type PublishingPrincipal } from '../auth';
import { POST as multipart } from '@/app/api/mcp/media/route';
import { POST as mcp } from '@/app/api/mcp/route';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const principal: PublishingPrincipal = { keyId: 'key1', organizationId: 'org1', userId: 'user1',
    canCreateDraft: false, canEditPost: false, canSchedulePost: false,
    userName: 'Uploader', canRead: true, canReadMedia: true, canPublish: true, canUpload: true, canReadAnalytics: false };
const file = { filename: 'image.png', mimeType: 'image/png', contentBase64: Buffer.from('test file bytes').toString('base64') };
const bearer = () => ({ Authorization: `Bearer ${generatePublishingKey().key}` });
beforeEach(() => {
    vi.clearAllMocks();
    mocks.key.mockResolvedValue({ id: 'key1', organizationId: 'org1', userId: 'user1', scopes: ['read', 'publish', 'upload'], expiresAt: new Date(Date.now() + 60_000) });
    mocks.member.mockResolvedValue({ organizationId: 'org1', role: 'OWNER', user: {} });
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.upload.mockImplementation(async () => Response.json({ id: 'media1', filename: 'image.png', transcodeStatus: null }, { status: 201 }));
    mocks.createPosts.mockResolvedValue({ status: 201, posts: [{ id: 'post1' }] });
    mocks.post.mockResolvedValue({ status: 'SCHEDULED' });
});

describe('inline media uploads', () => {
    it('decodes canonical base64, uses the shared multipart pipeline, and returns a publishable id', async () => {
        const result = await uploadInline(principal, { ...file, folderId: 'folder1', tags: ['Launch'] });
        expect(result.id).toBe('media1');
        const [request, organizationId, validate] = mocks.upload.mock.calls[0];
        expect(organizationId).toBe('org1');
        expect(validate).toBe(validateMcpFilename);
        const form = await request.formData();
        const uploaded = form.get('file') as File;
        expect(uploaded.name).toBe('image.png');
        expect(uploaded.type).toBe('image/png');
        expect(Buffer.from(await uploaded.arrayBuffer()).toString()).toBe('test file bytes');
        expect(form.get('folderId')).toBe('folder1');
        expect(form.get('tags')).toBe('Launch');
        expect(mocks.activity).toHaveBeenCalledWith({ data: expect.objectContaining({ organizationId: 'org1', resourceId: 'media1', action: 'uploaded' }) });
    });
    it.each(['', '####', 'data:image/png;base64,aGVsbG8=', 'aGVsbG8', 'a===', 'YQ==junk', 'YQ= ='])('rejects malformed base64 %j', contentBase64 => {
        expect(() => decodeUpload({ ...file, contentBase64, tags: [] })).toThrow();
    });
    it.each(['../../file.png', 'file\\name.png', 'file.html', 'file.svg', 'file.mp4', 'file\u0000.png'])('rejects unsafe or mismatched filenames %j', filename => {
        expect(() => decodeUpload({ ...file, filename, tags: [] })).toThrow();
    });
    it('accepts exactly 8 MiB but rejects larger inline payloads', () => {
        expect(decodeUpload({ ...file, contentBase64: Buffer.alloc(MAX_MCP_FILE_BYTES).toString('base64'), tags: [] }).length).toBe(MAX_MCP_FILE_BYTES);
        expect(() => decodeUpload({ ...file, contentBase64: Buffer.alloc(MAX_MCP_FILE_BYTES + 1).toString('base64'), tags: [] })).toThrow('8 MiB');
    });
    it.each([{ url: 'https://example.com/file.png' }, { path: '/etc/passwd' }, { organizationId: 'foreign' }, { mimeType: 'text/html' }])('does not accept remote URLs, server paths, or tenant overrides %j', extra => {
        expect(uploadInput.safeParse({ ...file, ...extra }).success).toBe(false);
    });
    it('blocks publishing-only/read-only keys without consuming file bytes', async () => {
        expect((await uploadInline({ ...principal, canUpload: false }, file)).status).toBe(403);
        expect((await storeMcpUpload({ ...principal, canUpload: false }, new Request('http://localhost'))).status).toBe(403);
        expect(mocks.upload).not.toHaveBeenCalled();
    });
    it('shares a fail-closed per-key upload rate limit across both transports', async () => {
        mocks.rate.mockResolvedValue({ allowed: false });
        expect((await uploadInline(principal, file)).status).toBe(429);
        expect((await storeMcpUpload(principal, new Request('http://localhost'))).status).toBe(429);
        expect(mocks.rate).toHaveBeenLastCalledWith('key1', { max: 20, windowSeconds: 60, prefix: 'ratelimit:auth:mcp-upload' });
        expect(mocks.upload).not.toHaveBeenCalled();
    });
    it('does not expose internal storage errors', async () => {
        mocks.upload.mockResolvedValueOnce(Response.json({ error: 'Internal database secret' }, { status: 500 }));
        const result = await uploadInline(principal, file);
        expect(result.status).toBe(500);
        expect(JSON.stringify(result)).not.toContain('Internal database secret');
    });
});

describe('upload permissions and streaming endpoint', () => {
    it('old keys do not gain upload access and upload scope still requires media.upload', async () => {
        const request = new Request('http://localhost/api/mcp', { headers: bearer() });
        mocks.key.mockResolvedValueOnce({ id: 'old', organizationId: 'org1', userId: 'user1', scopes: ['read', 'publish'], expiresAt: new Date(Date.now() + 60_000) });
        expect((await authenticatePublishingKey(request))?.canUpload).toBe(false);
        mocks.member.mockResolvedValueOnce({ organizationId: 'org1', role: 'VIEWER', user: {} });
        expect((await authenticatePublishingKey(request))?.canUpload).toBe(false);
    });
    it('accepts an upload-only key without granting publish or post-status access', async () => {
        mocks.key.mockResolvedValueOnce({ id: 'uploader', organizationId: 'org1', userId: 'user1', scopes: ['upload'], expiresAt: new Date(Date.now() + 60_000) });
        const actor = await authenticatePublishingKey(new Request('http://localhost/api/mcp', { headers: bearer() }));
        expect(actor).toMatchObject({ canUpload: true, canPublish: false, canRead: false });
    });
    it('streams the original request directly into the shared upload pipeline', async () => {
        const request = new Request('http://localhost/api/mcp/media', { method: 'POST', headers: bearer(), body: 'streaming bytes' });
        const response = await multipart(request);
        expect(response.status).toBe(201);
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        expect(mocks.upload).toHaveBeenCalledWith(request, 'org1', validateMcpFilename);
    });
    it('rejects missing/revoked credentials and foreign-origin requests before reading the body', async () => {
        expect((await multipart(new Request('http://localhost/api/mcp/media', { method: 'POST' }))).status).toBe(401);
        mocks.key.mockResolvedValueOnce({ revokedAt: new Date() });
        expect((await multipart(new Request('http://localhost/api/mcp/media', { method: 'POST', headers: bearer() }))).status).toBe(401);
        expect((await multipart(new Request('http://localhost/api/mcp/media', { method: 'POST', headers: { ...bearer(), Origin: 'https://foreign.example' } }))).status).toBe(403);
        expect(mocks.upload).not.toHaveBeenCalled();
    });
    it('rate-limits by IP before looking up invalid credentials or consuming the upload', async () => {
        mocks.key.mockResolvedValueOnce(null);
        const request = () => new Request('http://localhost/api/mcp/media', { method: 'POST',
            headers: { ...bearer(), 'x-real-ip': '203.0.113.1' }, body: 'unread file bytes' });
        const first = request();
        expect((await multipart(first)).status).toBe(401);
        expect(first.bodyUsed).toBe(false);
        expect(mocks.rate).toHaveBeenCalledWith('203.0.113.1', {
            max: 60, windowSeconds: 60, prefix: 'ratelimit:auth:mcp-upload-ip',
        });
        expect(mocks.rate.mock.invocationCallOrder[0]).toBeLessThan(mocks.key.mock.invocationCallOrder[0]);

        mocks.rate.mockResolvedValueOnce({ allowed: false });
        const blocked = request();
        const response = await multipart(blocked);
        expect(response.status).toBe(429);
        expect(response.headers.get('Retry-After')).toBe('60');
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        expect(blocked.bodyUsed).toBe(false);
        expect(mocks.key).toHaveBeenCalledTimes(1);
        expect(mocks.member).not.toHaveBeenCalled();
        expect(mocks.upload).not.toHaveBeenCalled();
    });
    it('still enforces the per-key upload quota after the IP authentication quota passes', async () => {
        mocks.rate.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: false });
        const response = await multipart(new Request('http://localhost/api/mcp/media', {
            method: 'POST', headers: bearer(), body: 'unread file bytes',
        }));
        expect(response.status).toBe(429);
        expect(mocks.rate).toHaveBeenLastCalledWith('key1', { max: 20, windowSeconds: 60, prefix: 'ratelimit:auth:mcp-upload' });
        expect(mocks.upload).not.toHaveBeenCalled();
    });
    it('advertises a same-origin path and existing library size limits without disclosing credentials', () => {
        expect(mediaUploadConfig()).toMatchObject({ uploadPath: '/api/mcp/media', maxInlineBytes: 8 * 1024 * 1024,
            maxVideoBytes: 1024 * 1024 * 1024, maxOtherBytes: 100 * 1024 * 1024 });
        expect(JSON.stringify(mediaUploadConfig())).not.toContain('osp_');
    });
    it('uploads through the real MCP SDK and references the returned id in publish_now', async () => {
        const client = new Client({ name: 'upload-test', version: '1.0.0' });
        const transport = new StreamableHTTPClientTransport(new URL('http://localhost/api/mcp'), {
            requestInit: { headers: bearer() }, fetch: async (url, init) => mcp(new Request(url, init)),
        });
        try {
            await client.connect(transport);
            const names = (await client.listTools()).tools.map(tool => tool.name);
            expect(names).toContain('upload_media');
            expect(names).toContain('get_media_upload_config');
            expect(names).not.toContain('schedule_post');
            const uploaded = await client.callTool({ name: 'upload_media', arguments: file });
            expect(uploaded.isError).toBe(false);
            const content = uploaded.content as { type: string; text: string }[];
            const mediaId = JSON.parse(content[0].text).id;
            mocks.media.mockResolvedValueOnce({ id: mediaId, mimeType: 'image/png', transcodeStatus: null, size: 15 });
            const mediaStatus = await client.callTool({ name: 'get_media_status', arguments: { mediaId } });
            expect(mediaStatus.isError).toBe(false);
            expect(mocks.media).toHaveBeenCalledWith(expect.objectContaining({ where: { id: mediaId, organizationId: 'org1' } }));
            mocks.media.mockResolvedValueOnce(null);
            expect((await client.callTool({ name: 'get_media_status', arguments: { mediaId: 'foreign' } })).isError).toBe(true);
            const published = await client.callTool({ name: 'publish_now', arguments: {
                requestId: randomUUID(), accountId: 'account1', caption: 'New upload', mediaIds: [mediaId],
            } });
            expect(published.isError).toBe(false);
            expect(mocks.createPosts).toHaveBeenCalledWith(expect.objectContaining({ mediaIds: ['media1'], autoPublish: true, scheduledAt: null }));
            const invalid = await client.callTool({ name: 'upload_media', arguments: { ...file, contentBase64: '####' } });
            expect(invalid.isError).toBe(true);
        } finally { await client.close(); }
    });
});
