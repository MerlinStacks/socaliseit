import { db } from '@/lib/db';
import { sebProactiveQueue } from '@/lib/bullmq/queues';
import { metadataObject, recordSebReview } from '@/lib/seb-review';

/** Repair abandoned reservations only when the queue confirms no job can finish them.
 * The grace period covers the separate database-reservation / Redis-enqueue writes.
 * Redis errors propagate: an unavailable queue is not evidence of a failed job.
 */
export async function reconcileSebReviews(organizationId: string) {
    const pending = await db.sebReport.findMany({
        where: { organizationId, status: 'GENERATING', updatedAt: { lt: new Date(Date.now() - 5 * 60_000) } },
        orderBy: { createdAt: 'asc' }, take: 100,
    });
    for (const report of pending) {
        const metadata = metadataObject(report.metadata);
        const jobId = typeof metadata.queueJobId === 'string' ? metadata.queueJobId : `seb-report-${report.id}`;
        const job = await sebProactiveQueue.getJob(jobId);
        const state = job ? await job.getState() : 'missing';
        if (['failed', 'completed', 'unknown', 'missing'].includes(state)) {
            await recordSebReview(organizationId, report.id, 'FAILED', 'Review interrupted: queue job is no longer pending');
        }
    }
}
