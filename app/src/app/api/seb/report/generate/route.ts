import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSebUsageLimits } from '@/lib/ai/seb-advisor';
import { reserveSebReview, recordSebReview } from '@/lib/seb-review';
import { reconcileSebReviews } from '@/lib/seb-review-queue';
import { enqueueSebReportGeneration } from '@/lib/bullmq/queues';
import { checkRateLimit, EXPENSIVE_RATE_LIMIT, createRateLimitHeaders } from '@/lib/rate-limit';
import { createRouteLogger } from '@/lib/logger';

const log = createRouteLogger('API', '/api/seb/report/generate');

export async function POST() {
    try {
        const session = await auth();
        const organizationId = session?.user?.currentOrganizationId;
        if (!session?.user?.id || !organizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const rateLimit = await checkRateLimit(`${session.user.id}:seb-generate`, EXPENSIVE_RATE_LIMIT);
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: 'Seb is thinking hard already. Please try again shortly.' },
                { status: 429, headers: createRateLimitHeaders(rateLimit) },
            );
        }

        const limits = await getSebUsageLimits();
        await reconcileSebReviews(organizationId);
        const reservation = await reserveSebReview(organizationId, 'MANUAL', session.user.id, limits.maxReportsPerDay);
        if (reservation.limited || !reservation.report) {
            return NextResponse.json({ error: `Seb report limit reached for today (${limits.maxReportsPerDay}).` }, { status: 429 });
        }

        const report = reservation.report;
        if (reservation.existing) return NextResponse.json({ report, jobId: `seb-report-${report.id}`, existing: true }, { status: 202 });
        let jobId: string;
        try {
            jobId = await enqueueSebReportGeneration({ organizationId, userId: session.user.id, reportId: report.id, trigger: 'MANUAL' });
        } catch (error) {
            await recordSebReview(organizationId, report.id, 'FAILED', 'Could not enqueue review');
            throw error;
        }
        return NextResponse.json({ report, jobId }, { status: 202 });
    } catch (error) {
        log.error({ err: error }, 'Failed to generate Seb report');
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to generate Seb report' }, { status: 500 });
    }
}
