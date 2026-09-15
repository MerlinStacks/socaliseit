import { db } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';

export type ReviewStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type ReviewEvent = { status: ReviewStatus; stage: string; createdAt: string };
export function metadataObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function reviewEvents(metadata: unknown): ReviewEvent[] {
    const events = metadataObject(metadata).reviewEvents;
    return Array.isArray(events) ? events.filter((e): e is ReviewEvent => Boolean(e) &&
        ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'].includes(e.status) &&
        typeof e.stage === 'string' && typeof e.createdAt === 'string') : [];
}

/** Both manual and proactive reservations serialize on the same organization lock. */
export async function reserveSebReview(organizationId: string, trigger: 'MANUAL' | 'PROACTIVE', userId?: string, maxReportsPerDay?: number, queueJobId?: string) {
    return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId}, 731))::text`;
        const active = await tx.sebReport.findFirst({ where: { organizationId, status: 'GENERATING' }, orderBy: { createdAt: 'desc' } });
        if (active) return { report: active, existing: true, limited: false };
        if (maxReportsPerDay !== undefined) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const count = await tx.sebReport.count({ where: { organizationId, trigger: 'MANUAL', createdAt: { gte: today } } });
            if (count >= maxReportsPerDay) return { report: null, existing: false, limited: true };
        }
        const event: ReviewEvent = { status: 'QUEUED', stage: 'Waiting for worker', createdAt: new Date().toISOString() };
        const report = await tx.sebReport.create({ data: {
            organizationId, trigger, generatedById: userId, status: 'GENERATING',
            title: 'Seb is reviewing your social media',
            summary: 'Seb is analysing posts, analytics, competitors, brand knowledge, platform knowledge, and media frames.',
            metadata: { review: event, reviewEvents: [event], ...(queueJobId ? { queueJobId } : {}) },
        } });
        return { report, existing: false, limited: false };
    });
}

/** Merge advisor metadata; its completed report write replaces metadata, so carry prior events explicitly. */
export async function recordSebReview(organizationId: string, id: string, status: ReviewStatus, stage: string, prior: ReviewEvent[] = []) {
    return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId}, 731))::text`;
        const report = await tx.sebReport.findFirst({ where: { id, organizationId } });
        if (!report) throw new Error('Seb report not found');
        if (status === 'FAILED' && report.status === 'COMPLETED') return report;
        const event: ReviewEvent = { status, stage, createdAt: new Date().toISOString() };
        const events = [...prior, ...reviewEvents(report.metadata)].filter((e, i, all) => all.findIndex(other => other.createdAt === e.createdAt && other.status === e.status) === i);
        return tx.sebReport.update({ where: { id, organizationId }, data: {
            status: status === 'QUEUED' || status === 'RUNNING' ? 'GENERATING' : status,
            metadata: { ...metadataObject(report.metadata), review: event, reviewEvents: [...events, event].slice(-30) } as Prisma.InputJsonValue,
        } });
    });
}
