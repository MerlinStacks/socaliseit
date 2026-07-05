import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createRouteLogger } from '@/lib/logger';

const log = createRouteLogger('API', '/api/seb/report');

export async function GET() {
    try {
        const session = await auth();
        const organizationId = session?.user?.currentOrganizationId;
        if (!session?.user?.id || !organizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const [latest, history] = await Promise.all([
            db.sebReport.findFirst({
                where: { organizationId },
                orderBy: { createdAt: 'desc' },
                include: {
                    recommendations: {
                        where: { status: { in: ['NEW', 'IN_PROGRESS'] } },
                        include: { socialAccount: { select: { id: true, name: true, username: true } } },
                        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
                    },
                    experiments: { orderBy: { createdAt: 'desc' } },
                },
            }),
            db.sebReport.findMany({
                where: { organizationId },
                orderBy: { createdAt: 'desc' },
                take: 12,
                select: { id: true, title: true, summary: true, overallScore: true, confidence: true, trigger: true, createdAt: true },
            }),
        ]);

        return NextResponse.json({ latest, history });
    } catch (error) {
        log.error({ err: error }, 'Failed to fetch Seb reports');
        return NextResponse.json({ error: 'Failed to fetch Seb reports' }, { status: 500 });
    }
}
