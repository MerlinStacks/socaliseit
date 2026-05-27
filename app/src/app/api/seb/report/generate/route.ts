import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSebUsageLimits } from '@/lib/ai/seb-advisor';
import { db } from '@/lib/db';
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
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const reportsToday = await db.sebReport.count({
            where: { organizationId, trigger: 'MANUAL', createdAt: { gte: today } },
        });
        if (reportsToday >= limits.maxReportsPerDay) {
            return NextResponse.json({ error: `Seb report limit reached for today (${limits.maxReportsPerDay}).` }, { status: 429 });
        }

        const report = await db.sebReport.create({
            data: {
                organizationId,
                trigger: 'MANUAL',
                status: 'GENERATING',
                title: 'Seb is reviewing your social media',
                summary: 'Seb is analysing posts, analytics, competitors, brand knowledge, platform knowledge, and media frames.',
                generatedById: session.user.id,
            },
        });
        const jobId = await enqueueSebReportGeneration({ organizationId, userId: session.user.id, reportId: report.id, trigger: 'MANUAL' });
        return NextResponse.json({ report, jobId }, { status: 202 });
    } catch (error) {
        log.error({ err: error }, 'Failed to generate Seb report');
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to generate Seb report' }, { status: 500 });
    }
}
