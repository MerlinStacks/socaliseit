import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { checkPublishStatus } from '@/lib/platform-api/tiktok-api';
import { processStalePostCleanup } from '../stale-post-cleanup';

vi.mock('bullmq', () => ({ Worker: vi.fn() }));
vi.mock('@/lib/bullmq/connection', () => ({ getBullMQConnection: vi.fn() }));
vi.mock('@/lib/publish-lock', () => ({ isPublishLocked: vi.fn().mockResolvedValue(false) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/services/token-service', () => ({ ensureValidToken: vi.fn().mockResolvedValue({ success: true, accessToken: 'token' }) }));
vi.mock('@/lib/platform-api/tiktok-api', () => ({ checkPublishStatus: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {
    $transaction: vi.fn(), post: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    publishError: { create: vi.fn() }, activity: { create: vi.fn() },
} }));

describe('stale TikTok cleanup', () => {
    const legacy = {
        id: 'native', organizationId: 'org', socialAccountId: 'account', platform: 'TIKTOK',
        status: 'PUBLISHED', platformPostId: null, externalId: 'tiktok_pending:accepted',
        publishedAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
    };
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(db.$transaction).mockImplementation(async (fn: any) => fn(db));
        vi.mocked(db.post.findMany).mockResolvedValue([legacy] as never);
        vi.mocked(db.post.findFirst).mockResolvedValue(null);
        vi.mocked(db.post.updateMany).mockResolvedValue({ count: 1 });
    });

    it('selects legacy externalId-only rows and keeps completed uploads recoverable', async () => {
        vi.mocked(checkPublishStatus).mockResolvedValue({ success: true, data: { status: 'PUBLISH_COMPLETE' } });
        await processStalePostCleanup({} as never);
        const query = vi.mocked(db.post.findMany).mock.calls[0][0];
        expect(query?.where?.OR).toEqual(expect.arrayContaining([expect.objectContaining({
            status: { in: ['PUBLISHED', 'FAILED'] }, platform: 'TIKTOK',
            OR: expect.arrayContaining([{ platformPostId: null, externalId: { startsWith: 'tiktok_pending:' } }]),
        })]));
        expect(checkPublishStatus).toHaveBeenCalledWith('token', 'accepted');
        expect(db.post.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
            status: 'PUBLISHED', publishedAt: legacy.publishedAt, platformPostId: 'tiktok_pending:accepted',
        }) }));
        expect(db.publishError.create).not.toHaveBeenCalled();
    });

    it('does not fail an old accepted upload when its outcome is unknown', async () => {
        vi.mocked(db.post.findMany).mockResolvedValue([{ ...legacy, status: 'PUBLISHING', platformPostId: legacy.externalId }] as never);
        vi.mocked(checkPublishStatus).mockResolvedValue({ success: false, error: 'unavailable' });
        await processStalePostCleanup({} as never);
        expect(db.post.updateMany).not.toHaveBeenCalled();
        expect(db.publishError.create).not.toHaveBeenCalled();
    });
});
