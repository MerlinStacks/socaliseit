import { Job, Worker } from 'bullmq';
import { getBullMQConnection } from '@/lib/bullmq/connection';
import { SocialListeningCrawlerJobData } from '@/lib/bullmq/queues';
import { createJobLogger } from '@/lib/logger';
import { crawlListeningSources } from '@/lib/services/social-listening-crawler';
import { syncListeningItems } from '@/lib/services/social-listening';

export async function processSocialListeningCrawler(job: Job<SocialListeningCrawlerJobData>): Promise<void> {
    const log = createJobLogger(job.id || 'unknown', 'social-listening-crawler');
    const { organizationId } = job.data;

    try {
        const crawler = await crawlListeningSources(organizationId);
        const listening = await syncListeningItems(organizationId);
        const summary = {
            sources: crawler.sources,
            documents: crawler.documents,
            matched: crawler.matched,
            monitors: listening.monitors,
            synced: listening.synced,
            errorCount: crawler.errors.length,
            ...(crawler.errors.length > 0 && { errors: crawler.errors }),
        };

        if (crawler.errors.length > 0) {
            log.warn(summary, 'Social listening crawler completed with errors');
        } else if (crawler.sources === 0 && listening.monitors === 0) {
            log.debug({ organizationId }, 'Social listening crawler skipped: no sources or monitors');
        } else if (listening.monitors === 0) {
            log.debug({ organizationId, sources: crawler.sources }, 'Social listening crawler completed with no active monitors');
        } else if (crawler.sources === 0 && listening.synced === 0) {
            log.debug({ organizationId, monitors: listening.monitors }, 'Social listening crawler completed with no sources or matching items');
        } else {
            log.info(summary, 'Social listening crawler completed');
        }
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

    worker.on('failed', (job, err) => {
        const log = createJobLogger(job?.id || 'unknown', 'social-listening-crawler');
        log.error({ err }, 'Social listening crawler job failed');
    });

    return worker;
}
