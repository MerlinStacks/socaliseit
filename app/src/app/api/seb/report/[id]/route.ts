import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createRouteLogger } from '@/lib/logger';

const log = createRouteLogger('API', '/api/seb/report/[id]');

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        const organizationId = session?.user?.currentOrganizationId;
        if (!session?.user?.id || !organizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const report = await db.sebReport.findFirst({ where: { id, organizationId }, select: { id: true } });
        if (!report) {
            return NextResponse.json({ error: 'Report not found' }, { status: 404 });
        }

        await db.sebReport.delete({ where: { id } });
        return NextResponse.json({ ok: true });
    } catch (error) {
        log.error({ err: error }, 'Failed to delete Seb report');
        return NextResponse.json({ error: 'Failed to delete Seb report' }, { status: 500 });
    }
}
