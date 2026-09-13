/** Unified inbox: grouping, workflow filters, counts and pagination share one SQL snapshot. */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { inboxQuerySchema, buildInboxQuery } from './query';

export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const query = inboxQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
        const [result] = await db.$queryRaw<Array<{ data: unknown[]; total: number; counts: Record<string, number> }>>(
            buildInboxQuery(session.user.currentOrganizationId, session.user.id, query),
        );
        return NextResponse.json({
            data: result.data,
            pagination: { page: query.page, limit: 30, total: result.total, totalPages: Math.ceil(result.total / 30) },
            counts: result.counts,
        });
    } catch (error) {
        if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid query', details: error.issues }, { status: 400 });
        logger.error({ error }, 'Unified inbox fetch failed');
        return NextResponse.json({ error: 'Failed to fetch inbox' }, { status: 500 });
    }
}
