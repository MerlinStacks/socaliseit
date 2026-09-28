import { Worker } from 'bullmq';
import { getBullMQConnection } from '@/lib/bullmq/connection';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { analyzeMediaTags } from '@/lib/ai/media-tagging';
import { SebProviderError } from '@/lib/ai/seb-provider-error';

export function createMediaTagWorker() {
    const worker = new Worker<{ organizationId: string; mediaId: string }>('media-tag', async job => {
        const { organizationId, mediaId } = job.data;
        const updated = await db.media.updateMany({
            where: { id: mediaId, organizationId, aiTagStatus: { in: ['pending', 'processing'] } },
            data: { aiTagStatus: 'processing', aiTagError: null },
        });
        if (!updated.count) return;
        try {
            await analyzeMediaTags(organizationId, mediaId);
        } catch (error) {
            await db.media.updateMany({
                where: { id: mediaId, organizationId },
                data: {
                    aiTagStatus: 'failed',
                    aiTagError: error instanceof SebProviderError ? error.message : 'Media analysis failed. Please try again.',
                },
            });
            throw error;
        }
    }, { connection: getBullMQConnection(), concurrency: 2 });
    worker.on('error', error => logger.error({ err: error }, 'Media tagging worker error'));
    worker.on('failed', (job, error) => logger.warn({ jobId: job?.id, err: error }, 'Media tagging failed'));
    return worker;
}
