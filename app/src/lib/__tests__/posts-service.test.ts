import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPosts } from '@/lib/posts-service';
import { db } from '@/lib/db';
import * as queue from '@/lib/queue';

vi.mock('@/lib/db', () => ({
    db: {
        socialAccount: { findMany: vi.fn() },
        post: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
        activity: { create: vi.fn() },
        hashtag: { upsert: vi.fn() },
        contentPillar: { findUnique: vi.fn() }
    }
}));

vi.mock('@/lib/queue', () => ({
    schedulePost: vi.fn(),
    publishNow: vi.fn(),
    schedulePublishReminder: vi.fn()
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock('@/lib/cache', () => ({
    invalidatePostCaches: vi.fn()
}));

vi.mock('@/lib/validate-post', () => ({
    validatePostContent: vi.fn().mockReturnValue({ valid: true, errors: [] })
}));

describe('posts-service (createPosts)', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Default mock responses
        vi.mocked(db.socialAccount.findMany).mockResolvedValue([
            { id: 'acc-1', platform: 'INSTAGRAM' } as any
        ]);
        
        vi.mocked(db.post.create).mockResolvedValue({
            id: 'post-1',
            caption: 'Test post',
            status: 'DRAFT',
            autoPublish: true,
            createdAt: new Date(),
            platform: 'INSTAGRAM',
            linkedGroupId: 'group-1'
        } as any);
        vi.mocked(db.post.findFirst).mockResolvedValue(null);

        vi.mocked(queue.schedulePost).mockResolvedValue({ success: true, jobId: 'job-1', scheduledAt: new Date() });
        vi.mocked(queue.publishNow).mockResolvedValue({ success: true, jobId: 'job-2' });
    });

    it('returns 400 if no platform accounts provided', async () => {
        const result = await createPosts({
            organizationId: 'org-1',
            userId: 'user-1',
            userName: 'User One',
            platformAccountIds: []
        });

        expect(result.status).toBe(400);
        expect(result.error).toMatch(/At least one platform account/);
    });

    it('returns 400 if caption is missing and autoPublish is true', async () => {
        const result = await createPosts({
            organizationId: 'org-1',
            userId: 'user-1',
            userName: 'User One',
            platformAccountIds: ['acc-1'],
            autoPublish: true,
            caption: '   ' // empty string
        });

        expect(result.status).toBe(400);
        expect(result.error).toMatch(/Caption is required/);
    });

    it('allows empty caption if all platforms are STORIES', async () => {
        const result = await createPosts({
            organizationId: 'org-1',
            userId: 'user-1',
            userName: 'User One',
            platformAccountIds: ['acc-1'],
            autoPublish: true,
            platformSettings: {
                'acc-1': { postType: 'STORY' }
            }
        });

        // 201 Created means validation passed
        expect(result.status).toBe(201);
        expect(db.post.create).toHaveBeenCalled();
    });

    it('returns 400 if social accounts are not found', async () => {
        vi.mocked(db.socialAccount.findMany).mockResolvedValue([]); // returns 0, expects 1

        const result = await createPosts({
            organizationId: 'org-1',
            userId: 'user-1',
            userName: 'User One',
            platformAccountIds: ['invalid-acc']
        });

        expect(result.status).toBe(400);
        expect(result.error).toMatch(/accounts not found/);
    });

    it('creates independent posts per platform with linked group ID', async () => {
        vi.mocked(db.socialAccount.findMany).mockResolvedValue([
            { id: 'acc-1', platform: 'INSTAGRAM' } as any,
            { id: 'acc-2', platform: 'LINKEDIN' } as any
        ]);

        const result = await createPosts({
            organizationId: 'org-1',
            userId: 'user-1',
            userName: 'User One',
            caption: 'Test post',
            platformAccountIds: ['acc-1', 'acc-2']
        });

        expect(result.status).toBe(201);
        expect(result.count).toBe(2);
        expect(db.post.create).toHaveBeenCalledTimes(2);

        const groupIds = new Set(result.posts?.map(p => p.linkedGroupId));
        expect(groupIds.size).toBe(1); // all share the same ID
        expect([...groupIds][0]).toBeDefined();
    });

    it('queues posts for immediate publishing if autoPublish and no scheduledAt', async () => {
        await createPosts({
            organizationId: 'org-1',
            userId: 'user-1',
            userName: 'User One',
            caption: 'Test post',
            platformAccountIds: ['acc-1'],
            autoPublish: true
        });

        expect(queue.publishNow).toHaveBeenCalledWith('post-1', 'org-1');
        expect(queue.schedulePost).not.toHaveBeenCalled();
    });

    it('schedules posts via BullMQ if autoPublish and scheduledAt is in the future', async () => {
        const futureDate = new Date(Date.now() + 86400000).toISOString(); // +1 day

        await createPosts({
            organizationId: 'org-1',
            userId: 'user-1',
            userName: 'User One',
            caption: 'Test post',
            platformAccountIds: ['acc-1'],
            autoPublish: true,
            scheduledAt: futureDate
        });

        expect(queue.schedulePost).toHaveBeenCalledWith('post-1', 'org-1', {
            datetime: expect.any(Date),
            timezone: 'UTC',
            platforms: []
        });
        expect(queue.publishNow).not.toHaveBeenCalled();
    });

    it('returns 409 if another post is already scheduled for the same platform and time', async () => {
        const futureDate = new Date(Date.now() + 86400000).toISOString();
        vi.mocked(db.post.findFirst).mockResolvedValue({
            id: 'existing-post',
            platform: 'INSTAGRAM',
            scheduledAt: new Date(futureDate),
        } as any);

        const result = await createPosts({
            organizationId: 'org-1',
            userId: 'user-1',
            userName: 'User One',
            caption: 'Test post',
            platformAccountIds: ['acc-1'],
            autoPublish: true,
            scheduledAt: futureDate,
        });

        expect(result.status).toBe(409);
        expect(result.error).toMatch(/instagram post is already scheduled/i);
        expect(db.post.create).not.toHaveBeenCalled();
        expect(queue.schedulePost).not.toHaveBeenCalled();
    });

    it('returns 409 if two selected accounts use the same platform at the same time', async () => {
        vi.mocked(db.socialAccount.findMany).mockResolvedValue([
            { id: 'acc-1', platform: 'INSTAGRAM' } as any,
            { id: 'acc-2', platform: 'INSTAGRAM' } as any,
        ]);

        const result = await createPosts({
            organizationId: 'org-1',
            userId: 'user-1',
            userName: 'User One',
            caption: 'Test post',
            platformAccountIds: ['acc-1', 'acc-2'],
            autoPublish: true,
            scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        });

        expect(result.status).toBe(409);
        expect(result.error).toMatch(/multiple instagram posts/i);
        expect(db.post.findFirst).not.toHaveBeenCalled();
        expect(db.post.create).not.toHaveBeenCalled();
    });

    it('creates reminder only if autoPublish is false and scheduledAt is present', async () => {
        const futureDate = new Date(Date.now() + 86400000).toISOString(); // +1 day

        // Why: Override mock to return autoPublish: false so the queuing loop
        // (which now reads post.autoPublish) takes the reminder branch.
        vi.mocked(db.post.create).mockResolvedValue({
            id: 'post-1',
            caption: 'Test post',
            status: 'SCHEDULED',
            autoPublish: false,
            createdAt: new Date(),
            platform: 'INSTAGRAM',
            linkedGroupId: null,
            scheduledAt: new Date(futureDate),
        } as any);

        await createPosts({
            organizationId: 'org-1',
            userId: 'user-1',
            userName: 'User One',
            caption: 'Test post',
            platformAccountIds: ['acc-1'],
            autoPublish: false,
            scheduledAt: futureDate
        });

        expect(queue.schedulePublishReminder).toHaveBeenCalledWith(
            'post-1',
            'org-1',
            'Test post',
            expect.any(String),
            expect.any(Date)
        );
        expect(queue.schedulePost).not.toHaveBeenCalled();
        expect(queue.publishNow).not.toHaveBeenCalled();
    });
});
