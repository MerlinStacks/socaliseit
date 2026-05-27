import { Job, Worker } from 'bullmq';
import { getBullMQConnection } from '@/lib/bullmq/connection';
import { SebProactiveJobData } from '@/lib/bullmq/queues';
import { generateDueSebReports, generateSebReport } from '@/lib/ai/seb-advisor';
import { createJobLogger } from '@/lib/logger';

async function processSebProactive(job: Job<SebProactiveJobData>): Promise<void> {
    const log = createJobLogger(job.id || 'unknown', 'seb-proactive');
    log.info({ type: job.data.type }, 'Starting Seb job');
    if (job.data.type === 'generate-report') {
        if (!job.data.organizationId || !job.data.reportId) throw new Error('Missing Seb report job data');
        await generateSebReport({
            organizationId: job.data.organizationId,
            userId: job.data.userId,
            reportId: job.data.reportId,
            trigger: job.data.trigger ?? 'MANUAL',
        });
        log.info({ reportId: job.data.reportId }, 'Seb report generation complete');
        return;
    }

    const result = await generateDueSebReports();
    log.info(result, 'Seb proactive refresh complete');
}

export function createSebProactiveWorker(): Worker<SebProactiveJobData> {
    const worker = new Worker<SebProactiveJobData>('seb-proactive', processSebProactive, {
        connection: getBullMQConnection(),
        concurrency: 1,
        limiter: {
            max: 2,
            duration: 60_000,
        },
    });

    worker.on('failed', (job, err) => {
        const log = createJobLogger(job?.id || 'unknown', 'seb-proactive');
        log.error({ err }, 'Seb proactive job failed');
    });

    return worker;
}
