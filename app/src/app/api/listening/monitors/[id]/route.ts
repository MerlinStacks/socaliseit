import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { listeningApi, listeningBody } from '@/lib/services/listening-api';
import { updateListeningMonitor } from '@/lib/services/listening-management';
import { updateMonitorSchema } from '@/lib/validation/social-listening';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
    return listeningApi(true, async (organizationId) => {
        const { id } = await params;
        const input = updateMonitorSchema.parse(await listeningBody(request));
        return NextResponse.json({ monitor: await updateListeningMonitor(organizationId, id, input) });
    });
}

export async function DELETE(_request: NextRequest, { params }: Context) {
    return listeningApi(true, async (organizationId) => {
        const { id } = await params;
        // The schema cascades deletion of the monitor's items.
        await db.socialListeningMonitor.delete({ where: { id, organizationId } });
        return NextResponse.json({ success: true });
    });
}
