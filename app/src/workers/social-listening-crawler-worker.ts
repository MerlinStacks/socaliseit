import { Job, Worker } from 'bullmq';
import { getBullMQConnection } from '@/lib/bullmq/connection';
import { SocialListeningCrawlerJobData } from '@/lib/bullmq/queues';
import { createJobLogger } from '@/lib/logger';
import { crawlListeningSources } from '@/lib/services/social-listening-crawler';
import { syncListeningItems } from '@/lib/services/social-listening';

async function processSocialListeningCrawler(job: Job<SocialListeningCrawlerJobData>): Promise<void> {
    const log = createJobLogger(job.id || 'unknown', 'social-listening-crawler');
    const { organizationId } = job.data;

    log.info({ organizationId }, 'Starting social listening crawler job');

    try {
        const crawler = await crawlListeningSources(organizationId);
        const listening = await syncListeningItems(organizationId);
        log.info({ crawler, listening }, 'Social listening crawler job completed');
    } catch (error) {
        log.error({ err: error }, 'Social listening crawler job failed');
        throw error;
    }
}

export function createSocialListeningCrawlerWorker(): Worker<SocialListeningCrawlerJobData> {
    const worker = new Worker<SocialListeningCrawlerJobData>('social-listening-crawler', processSocialListeningCrawler, {
        connection: getBullMQConnection(),
        concurrency: 2,
        limiter: {
            max: 20,
            duration: 60_000,
        },
    });

    worker.on('completed', (job) => {
        const log = createJobLogger(job.id || 'unknown', 'social-listening-crawler');
        log.info('Social listening crawler job completed successfully');
    });

    worker.on('failed', (job, err) => {
        const log = createJobLogger(job?.id || 'unknown', 'social-listening-crawler');
        log.error({ err }, 'Social listening crawler job failed');
    });

    return worker;
}
