import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { metadataObject, reviewEvents } from '@/lib/seb-review';
import { reconcileSebReviews } from '@/lib/seb-review-queue';
import { createRouteLogger } from '@/lib/logger';

const log = createRouteLogger('API', '/api/seb/workspace');
const account = { socialAccount: { select: { id: true, name: true, username: true } } } as const;
const order = [{ updatedAt: 'desc' }, { id: 'desc' }] as const;
const summary = { id: true, title: true, summary: true, status: true, overallScore: true, confidence: true, trigger: true, createdAt: true, updatedAt: true } as const;

export async function GET() {
    try {
        const session = await auth();
        const organizationId = session?.user?.currentOrganizationId;
        if (!session?.user?.id || !organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        // A queue outage must not hide the last completed report.
        await reconcileSebReviews(organizationId).catch(error => log.warn({ err: error }, 'Could not reconcile Seb queue'));
        const [latest, activeReview, newestReview, activeRecommendations, closedRecommendations, activeExperiments, closedExperiments, reports] = await Promise.all([
            db.sebReport.findFirst({ where: { organizationId, status: 'COMPLETED' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
            db.sebReport.findFirst({ where: { organizationId, status: 'GENERATING' }, orderBy: { createdAt: 'desc' } }),
            db.sebReport.findFirst({ where: { organizationId }, orderBy: { createdAt: 'desc' } }),
            db.sebRecommendation.findMany({ where: { organizationId, status: { in: ['NEW', 'IN_PROGRESS'] } }, include: account, orderBy: [...order], take: 101 }),
            db.sebRecommendation.findMany({ where: { organizationId, status: { in: ['DONE', 'DISMISSED'] } }, include: account, orderBy: [...order], take: 51 }),
            db.sebExperiment.findMany({ where: { organizationId, status: { in: ['PLANNED', 'RUNNING'] } }, orderBy: [...order], take: 101 }),
            db.sebExperiment.findMany({ where: { organizationId, status: { in: ['COMPLETED', 'CANCELLED'] } }, orderBy: [...order], take: 51 }),
            db.sebReport.findMany({ where: { organizationId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 21, select: { ...summary, metadata: true } }),
        ]);
        const current = activeReview ?? newestReview;
        const state = metadataObject(metadataObject(current?.metadata).review);
        const review = current ? {
            id: current.id,
            status: current.status === 'GENERATING' ? (state.status === 'QUEUED' ? 'QUEUED' : 'RUNNING') : current.status,
            stage: typeof state.stage === 'string' && (current.status === 'GENERATING' || state.status === current.status) ? state.stage : null,
            createdAt: current.createdAt, updatedAt: current.updatedAt,
        } : null;
        const recommendations = [...activeRecommendations.slice(0, 100), ...closedRecommendations.slice(0, 50)];
        const experiments = [...activeExperiments.slice(0, 100), ...closedExperiments.slice(0, 50)];
        const activity: { id: string; title: string; createdAt: string; actor: 'Seb' | 'You' | 'System'; detail?: string }[] = [];
        for (const report of reports.slice(0, 20)) {
            const events = reviewEvents(report.metadata);
            if (events.length) events.forEach((event, index) => activity.push({
                id: `${report.id}:review:${index}`, title: event.stage, createdAt: event.createdAt,
                actor: event.status === 'QUEUED' || event.status === 'FAILED' ? 'System' : 'Seb', detail: `Recorded review transition: ${event.status}`,
            }));
            else activity.push({ id: `${report.id}:created`, title: report.title, createdAt: report.createdAt.toISOString(), actor: 'System', detail: 'Record-derived milestone: report created; historical transitions were not recorded.' });
        }
        for (const item of recommendations) activity.push({ id: `${item.id}:created`, title: item.title, createdAt: item.createdAt.toISOString(), actor: 'Seb', detail: 'Record-derived milestone: recommendation created.' });
        for (const item of experiments) activity.push({ id: `${item.id}:created`, title: item.title, createdAt: item.createdAt.toISOString(), actor: 'System', detail: 'Record-derived milestone: experiment created; creator was not recorded.' });
        activity.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
        return NextResponse.json({
            latest, review, recommendations, experiments,
            history: reports.slice(0, 20).map(({ metadata: _metadata, ...report }) => report),
            activity: activity.slice(0, 50),
            hasMore: { recommendations: { active: activeRecommendations.length > 100, closed: closedRecommendations.length > 50 }, experiments: { active: activeExperiments.length > 100, closed: closedExperiments.length > 50 }, history: reports.length > 20, activity: activity.length > 50 },
        }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        log.error({ err: error }, 'Failed to fetch Seb workspace');
        return NextResponse.json({ error: 'Failed to fetch Seb workspace' }, { status: 500 });
    }
}
