import { beforeEach, describe, expect, it, vi } from 'vitest';

const queueMocks = vi.hoisted(() => new Map<string, {
    add: ReturnType<typeof vi.fn>;
    getRepeatableJobs: ReturnType<typeof vi.fn>;
    removeRepeatableByKey: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
}>());

vi.mock('bullmq', () => ({
    Queue: class {
        constructor(name: string) {
            const queue = {
                add: vi.fn(),
                getRepeatableJobs: vi.fn(),
                removeRepeatableByKey: vi.fn(),
                close: vi.fn(),
            };
            queueMocks.set(name, queue);
            return queue;
        }
    },
}));

vi.mock('@/lib/bullmq/connection', () => ({
    getBullMQConnection: vi.fn(() => ({})),
}));

import {
    scheduleWorkspaceAnalyticsSync,
    scheduleWorkspaceEngagementSync,
    scheduleWorkspacePostsSync,
    scheduleWorkspaceSocialListeningCrawler,
} from '@/lib/bullmq/queues';

const schedulers = [
    ['analytics-sync', 'scheduled-sync', 'analytics-repeat-', scheduleWorkspaceAnalyticsSync],
    ['engagement-sync', 'scheduled-engagement-sync', 'engagement-repeat-', scheduleWorkspaceEngagementSync],
    ['posts-sync', 'scheduled-posts-sync', 'posts-repeat-', scheduleWorkspacePostsSync],
    ['social-listening-crawler', 'scheduled-crawl', 'listening-crawler-repeat-', scheduleWorkspaceSocialListeningCrawler],
] as const;

describe.each(schedulers)('%s organization repeat scheduling', (queueName, jobName, jobIdPrefix, schedule) => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('removes only the repeat job belonging to the requested organization', async () => {
        const queue = queueMocks.get(queueName)!;
        queue.getRepeatableJobs.mockResolvedValue([
            { id: `${jobIdPrefix}org-other`, name: jobName, key: 'other-org-key' },
            { id: `${jobIdPrefix}org-target`, name: jobName, key: 'target-org-key' },
        ]);

        await schedule('org-target');

        expect(queue.removeRepeatableByKey).toHaveBeenCalledOnce();
        expect(queue.removeRepeatableByKey).toHaveBeenCalledWith('target-org-key');
        expect(queue.add).toHaveBeenCalledWith(
            jobName,
            expect.objectContaining({ organizationId: 'org-target' }),
            expect.objectContaining({ jobId: `${jobIdPrefix}org-target` })
        );
    });
});
