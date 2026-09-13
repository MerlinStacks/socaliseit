import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { collaborationAccess } from '../workflow/access';
import { InboxError } from '../workflow/service';
import { buildReportingQuery, ReportingData, reportingDefinitions, reportingQuerySchema } from './query';

export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session.user.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const organizationId = session.user.currentOrganizationId;
        const input = reportingQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
        const data = await db.$transaction(async (tx) => {
            await collaborationAccess(tx, organizationId, session.user.id);
            const now = new Date();
            const [result] = await tx.$queryRaw<{ data: ReportingData }[]>(buildReportingQuery(organizationId, input, now));
            return result.data;
        }, { isolationLevel: 'RepeatableRead' });
        return NextResponse.json({ data, definitions: reportingDefinitions }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid request', details: error.issues }, { status: 400 });
        if (error instanceof InboxError) return NextResponse.json({ error: error.message }, { status: error.status });
        logger.error({ error }, 'Inbox reporting failed');
        return NextResponse.json({ error: 'Inbox reporting failed' }, { status: 500 });
    }
}
