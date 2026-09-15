import { Job, Worker, UnrecoverableError } from 'bullmq';
import { getBullMQConnection } from '@/lib/bullmq/connection';
import { SebProactiveJobData } from '@/lib/bullmq/queues';
import { generateSebReport, isSameSebLocalDate, normalizeSebTimezone } from '@/lib/ai/seb-advisor';
import { db } from '@/lib/db';
import { recordSebReview, reserveSebReview, reviewEvents } from '@/lib/seb-review';
import { reconcileSebReviews } from '@/lib/seb-review-queue';
import { createJobLogger } from '@/lib/logger';
import { initializeDueSebPillars, initializeSebPillars } from '@/lib/ai/seb-initial-pillars';

export async function runSebReview(data: SebProactiveJobData): Promise<void> {
    const { organizationId, reportId } = data;
    if (!organizationId || !reportId) throw new Error('Missing Seb report job data');
    const report = await db.sebReport.findFirst({ where: { id: reportId, organizationId } });
    if (!report) throw new Error('Seb report not found');
    // Retries must not duplicate recommendations on an already completed report.
    if (report.status === 'COMPLETED' || report.status === 'FAILED') return;
    const running = await recordSebReview(organizationId, reportId, 'RUNNING', 'Generating report');
    const events = reviewEvents(running.metadata);
    try {
        await generateSebReport({ organizationId, reportId, userId: data.userId, trigger: data.trigger ?? 'MANUAL' });
        await recordSebReview(organizationId, reportId, 'COMPLETED', 'Review completed', events);
    } catch (error) {
        await recordSebReview(organizationId, reportId, 'FAILED', 'Review generation failed', events);
        throw new UnrecoverableError(error instanceof Error ? error.message : 'Seb generation failed');
    }
}

export async function processSebProactive(job: Job<SebProactiveJobData>): Promise<void> {
    const log = createJobLogger(job.id || 'unknown', 'seb-proactive');
    log.info({ type: job.data.type }, 'Starting Seb job');
    if (job.data.type === 'initialize-pillars') {
        if (!job.data.organizationId) throw new Error('Missing Seb pillar organization');
        const result = await initializeSebPillars(job.data.organizationId);
        log.info({ organizationId: job.data.organizationId, result }, 'Seb initial pillars checked');
        return;
    }
    if (job.data.type === 'generate-report') {
        await runSebReview(job.data);
        log.info({ reportId: job.data.reportId }, 'Seb report generation complete');
        return;
    }

    // Independent of report success and the report's same-day suppression.
    await initializeDueSebPillars();
    const result = { generated: 0, skipped: 0 };
    const settings = await db.globalAISettings.findUnique({ where: { id: 'global_ai_settings' } });
    if (!settings?.isConfigured || !settings.sebEnabled || !settings.sebProactiveEnabled) return;
    const orgs = await db.organization.findMany({ select: { id: true, timezone: true } });
    for (const org of orgs) {
        const latest = await db.sebReport.findFirst({ where: { organizationId: org.id, status: 'COMPLETED' }, orderBy: { createdAt: 'desc' } });
        if (latest && isSameSebLocalDate(latest.createdAt, new Date(), normalizeSebTimezone(org.timezone))) {
            result.skipped++;
            continue;
        }
        try {
            await reconcileSebReviews(org.id);
            const reservation = await reserveSebReview(org.id, 'PROACTIVE', undefined, undefined, job.id);
            if (reservation.existing || !reservation.report) { result.skipped++; continue; }
            await runSebReview({ type: 'generate-report', organizationId: org.id, reportId: reservation.report.id, trigger: 'PROACTIVE' });
            result.generated++;
        } catch (error) {
            result.skipped++;
            log.error({ err: error, organizationId: org.id }, 'Seb proactive report failed');
        }
    }
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
