import { Worker } from 'bullmq';
import { getBullMQConnection } from '@/lib/bullmq/connection';
import type { BulkUploadJobData } from '@/lib/bullmq/queues';
import { logger } from '@/lib/logger';
import { processBatch } from '@/lib/publishing-queue/bulk';

/**
 * Bulk Upload worker.
 *
 * Local concurrency limits load; correctness comes from distributed batch and
 * profile locks in the service, including when several worker processes run.
 */
export function createBulkUploadWorker() {
    const worker = new Worker<BulkUploadJobData>('bulk-upload', async job => {
        const { organizationId, batchId } = job.data;
        await processBatch(organizationId, batchId);
    }, { connection: getBullMQConnection(), concurrency: 1 });

    worker.on('error', error => logger.error({ err: error }, 'Bulk upload worker error'));
    worker.on('failed', (job, error) =>
        logger.warn({ jobId: job?.id, batchId: job?.data.batchId, err: error }, 'Bulk batch processing failed'));
    return worker;
}
