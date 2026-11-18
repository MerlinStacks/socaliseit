import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { NotificationReminderJobData } from '@/lib/bullmq/queues';
import { processNotificationReminder } from '../notification-reminder';

const mocks = vi.hoisted(() => ({ find: vi.fn(), send: vi.fn(), lock: vi.fn(), release: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { post: { findUnique: mocks.find } } }));
vi.mock('@/lib/bullmq/connection', () => ({ getBullMQConnection: vi.fn() }));
vi.mock('@/lib/logger', () => ({ createJobLogger: () => ({ info: vi.fn() }) }));
vi.mock('@/lib/push-notifications', () => ({ sendPublishReminderNotification: mocks.send }));
vi.mock('@/lib/publish-lock', () => ({ acquirePublishLock: mocks.lock, releasePublishLock: mocks.release }));

const makeJob = (due: Date, legacy = false) => ({
    data: { postId: 'post', organizationId: 'org', caption: 'Caption', platform: 'instagram', ...(!legacy && { scheduledAt: due.toISOString() }) },
    timestamp: due.getTime() - 500,
    opts: { delay: 500 },
    moveToDelayed: vi.fn(),
}) as unknown as Job<NotificationReminderJobData>;

describe('manual publishing reminders', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.lock.mockResolvedValue('lock');
    });

    it.each([false, true])('ignores an already-active obsolete reminder (legacy: %s)', async legacy => {
        const due = new Date(Date.now() - 1000);
        mocks.find.mockResolvedValue({ status: 'SCHEDULED', autoPublish: false, scheduledAt: new Date(due.getTime() + 60_000) });
        await processNotificationReminder(makeJob(due, legacy));
        expect(mocks.send).not.toHaveBeenCalled();
        expect(mocks.release).toHaveBeenCalledWith('post', 'lock');
    });

    it('sends a matching reminder while holding the schedule lock', async () => {
        const due = new Date(Date.now() - 1000);
        mocks.find.mockResolvedValue({ status: 'SCHEDULED', autoPublish: false, scheduledAt: due });
        await processNotificationReminder(makeJob(due));
        expect(mocks.send).toHaveBeenCalledExactlyOnceWith('org', 'post', 'Caption', 'instagram');
        expect(mocks.send.mock.invocationCallOrder[0]).toBeLessThan(mocks.release.mock.invocationCallOrder[0]);
    });

    it('delays a valid job that starts early instead of sending prematurely', async () => {
        const due = new Date(Date.now() + 60_000);
        const job = makeJob(due);
        mocks.find.mockResolvedValue({ status: 'SCHEDULED', autoPublish: false, scheduledAt: due });
        await expect(processNotificationReminder(job, 'job-token')).rejects.toThrow('bullmq:movedToDelayed');
        expect(job.moveToDelayed).toHaveBeenCalledWith(due.getTime(), 'job-token');
        expect(mocks.send).not.toHaveBeenCalled();
    });
});
