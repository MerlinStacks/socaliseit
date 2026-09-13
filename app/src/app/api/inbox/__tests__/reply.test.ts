import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), account: vi.fn(), inbound: vi.fn(), update: vi.fn(), send: vi.fn(), comment: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/db', () => ({ db: { socialAccount: { findFirst: mocks.account }, directMessage: { findFirst: mocks.inbound, updateMany: mocks.update }, comment: { findFirst: mocks.comment } } }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/platform-api/dm-sync', () => ({ sendDMReply: mocks.send }));
vi.mock('@/lib/platform-api/facebook-api', () => ({ replyToFacebookComment: vi.fn() }));
vi.mock('@/lib/platform-api/instagram/comments', () => ({ replyToInstagramComment: vi.fn() }));
vi.mock('@/lib/platform-api/tiktok-api', () => ({ replyToTikTokComment: vi.fn() }));
vi.mock('@/lib/platform-api/youtube-api', () => ({ replyToYouTubeComment: vi.fn() }));
vi.mock('@/lib/services/token-service', () => ({ ensureValidToken: vi.fn() }));
import { POST } from '../reply/route';

const request = (extra = {}) => new NextRequest('http://localhost/api/inbox/reply', { method: 'POST',
    body: JSON.stringify({ type: 'dm', conversationId: 'thread', socialAccountId: 'account', text: 'hello', ...extra }) });
beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'user', currentOrganizationId: 'org' } });
    mocks.account.mockResolvedValue({ id: 'account', platform: 'INSTAGRAM' });
    mocks.inbound.mockResolvedValue({ senderId: 'verified-recipient', conversationId: 'thread' });
    mocks.send.mockResolvedValue({ success: true, messageId: 'sent' });
});
describe('reply ownership', () => {
    it('rejects foreign accounts and nonexistent threads before sending', async () => {
        mocks.account.mockResolvedValueOnce(null);
        expect((await POST(request())).status).toBe(404);
        mocks.inbound.mockResolvedValueOnce(null);
        expect((await POST(request())).status).toBe(404);
        expect(mocks.send).not.toHaveBeenCalled();
        expect(mocks.inbound).toHaveBeenCalledWith(expect.objectContaining({ where: {
            organizationId: 'org', socialAccountId: 'account', conversationId: 'thread', direction: 'inbound',
        } }));
    });
    it('rejects recipient spoofing and unsupported platforms', async () => {
        expect((await POST(request({ recipientId: 'other' }))).status).toBe(400);
        mocks.account.mockResolvedValueOnce({ id: 'account', platform: 'YOUTUBE' });
        expect((await POST(request())).status).toBe(501);
        expect(mocks.send).not.toHaveBeenCalled();
    });
    it('derives the recipient and preserves the verified conversation on the stored reply', async () => {
        expect((await POST(request())).status).toBe(200);
        expect(mocks.send).toHaveBeenCalledWith('account', 'verified-recipient', 'hello');
        expect(mocks.update).toHaveBeenCalledWith({ where: {
            organizationId: 'org', socialAccountId: 'account', platformMessageId: 'sent', direction: 'outbound',
        }, data: { conversationId: 'thread' } });
    });
    it('scopes comment platform IDs to the supplied account and tenant', async () => {
        mocks.comment.mockResolvedValue(null);
        expect((await POST(request({ type: 'comment' }))).status).toBe(404);
        expect(mocks.comment.mock.calls[0][0].where).toMatchObject({ organizationId: 'org', socialAccountId: 'account' });
    });
});
