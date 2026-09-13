// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import dns from 'node:dns/promises';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/media/import/route';
const mocks = vi.hoisted(() => ({
    auth: vi.fn(), limit: vi.fn(), metadata: vi.fn(), exec: vi.fn(), binaryDownload: vi.fn(),
    folder: vi.fn(), create: vi.fn(), mkdir: vi.fn(), access: vi.fn(), chmod: vi.fn(), stat: vi.fn(), unlink: vi.fn(),
}));
vi.mock('../auth', () => ({ auth: mocks.auth }));
vi.mock('../db', () => ({ db: { mediaFolder: { findFirst: mocks.folder }, media: { create: mocks.create } } }));
vi.mock('../logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock('../rate-limit', () => ({ checkRateLimit: mocks.limit, EXPENSIVE_RATE_LIMIT: {}, createRateLimitHeaders: () => ({}) }));
vi.mock('yt-dlp-wrap', () => ({ default: class {
    static downloadFromGithub = mocks.binaryDownload;
    getVideoInfo = mocks.metadata;
    execPromise = mocks.exec;
} }));
vi.mock('node:fs/promises', () => ({ default: {
    mkdir: mocks.mkdir, access: mocks.access, chmod: mocks.chmod, stat: mocks.stat, unlink: mocks.unlink,
} }));

function request(url: unknown = 'https://www.youtube.com/watch?v=example', folderId?: string) {
    return new NextRequest('http://localhost/api/media/import', {
        method: 'POST', body: JSON.stringify({ url, folderId }), headers: { 'content-type': 'application/json' },
    });
}
beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as never);
    mocks.auth.mockResolvedValue({ user: { id: 'user', currentOrganizationId: 'org' } });
    mocks.limit.mockResolvedValue({ allowed: true });
    mocks.metadata.mockResolvedValue({ title: 'Original Video Title' });
    mocks.exec.mockResolvedValue('');
    mocks.stat.mockResolvedValue({ size: 12345 });
    mocks.unlink.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue({ id: 'media', filename: 'Original Video Title.mp3', url: '/api/uploads/file.mp3', mimeType: 'audio/mpeg', size: 12345, tags: ['imported'], folder: null, createdAt: new Date() });
});

describe('compatible media import route', () => {
    it('requires authentication before invoking yt-dlp', async () => {
        mocks.auth.mockResolvedValue(null);
        expect((await POST(request())).status).toBe(401);
        expect(mocks.metadata).not.toHaveBeenCalled();
    });
    it.each(['http://127.0.0.1', 'http://[::ffff:7f00:1]', 'file:///etc/passwd', '--exec=command', 123])
        ('rejects invalid/nonpublic initial input %s', async (url) => {
            expect((await POST(request(url))).status).toBe(400);
            expect(mocks.metadata).not.toHaveBeenCalled();
            expect(mocks.exec).not.toHaveBeenCalled();
        });
    it('rejects a private DNS answer during preflight', async () => {
        vi.mocked(dns.lookup).mockResolvedValue([{ address: '10.0.0.1', family: 4 }] as never);
        expect((await POST(request())).status).toBe(400);
        expect(mocks.metadata).not.toHaveBeenCalled();
    });
    it('checks destination folder ownership before invoking yt-dlp', async () => {
        mocks.folder.mockResolvedValue(null);
        expect((await POST(request(undefined, 'other-folder'))).status).toBe(404);
        expect(mocks.folder).toHaveBeenCalledWith({ where: { id: 'other-folder', organizationId: 'org' }, select: { id: true } });
        expect(mocks.metadata).not.toHaveBeenCalled();
    });
    it('preserves webpage extraction, MP3 transcoding, metadata title and no-playlist behavior', async () => {
        expect((await POST(request())).status).toBe(201);
        expect(mocks.metadata).toHaveBeenCalledWith('https://www.youtube.com/watch?v=example');
        expect(mocks.exec).toHaveBeenCalledWith([
            'https://www.youtube.com/watch?v=example', '-x', '--audio-format', 'mp3', '-o',
            expect.stringMatching(/public\/uploads\/.*\.mp3$/), '--no-playlist',
        ]);
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
            organizationId: 'org', filename: 'Original Video Title.mp3', mimeType: 'audio/mpeg', size: 12345,
        }) }));
    });
    it('retains binary installation when yt-dlp is absent', async () => {
        mocks.access.mockRejectedValue(new Error('ENOENT'));
        expect((await POST(request())).status).toBe(201);
        expect(mocks.binaryDownload).toHaveBeenCalledWith(expect.stringMatching(/bin\/yt-dlp/));
    });
    it('cleans up the expected output when extraction or database creation fails', async () => {
        mocks.exec.mockRejectedValueOnce(new Error('extraction failed'));
        expect((await POST(request())).status).toBe(500);
        expect(mocks.unlink).toHaveBeenCalledWith(mocks.exec.mock.calls[0][0][5]);
        mocks.create.mockRejectedValueOnce(new Error('database unavailable'));
        expect((await POST(request())).status).toBe(500);
        expect(mocks.unlink).toHaveBeenCalledWith(mocks.exec.mock.calls[1][0][5]);
    });
});
