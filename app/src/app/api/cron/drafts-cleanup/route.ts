import { NextResponse } from 'next/server';
import { subDays } from 'date-fns';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_RETENTION_DAYS = 30;
const MAX_RETENTION_DAYS = 365;
const MIN_RETENTION_DAYS = 1;

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (
        process.env.CRON_SECRET &&
        authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const retentionDaysParam = parseInt(searchParams.get('retentionDays') || `${DEFAULT_RETENTION_DAYS}`, 10);
    const retentionDays = Math.min(
        Math.max(Number.isNaN(retentionDaysParam) ? DEFAULT_RETENTION_DAYS : retentionDaysParam, MIN_RETENTION_DAYS),
        MAX_RETENTION_DAYS,
    );

    try {
        const cutoff = subDays(new Date(), retentionDays);

        const result = await db.syncedDraft.deleteMany({
            where: {
                updatedAt: {
                    lt: cutoff,
                },
            },
        });

        return NextResponse.json({
            success: true,
            retentionDays,
            cutoff: cutoff.toISOString(),
            deletedCount: result.count,
        });
    } catch (error) {
        logger.error({ error }, 'Error cleaning up synced drafts');
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
