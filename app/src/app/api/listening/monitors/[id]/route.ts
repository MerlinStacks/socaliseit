import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const organizationId = session.user.currentOrganizationId;

    const monitor = await db.socialListeningMonitor.findFirst({
        where: { id, organizationId },
        select: { id: true },
    });

    if (!monitor) {
        return NextResponse.json({ error: 'Monitor not found' }, { status: 404 });
    }

    await db.$transaction([
        db.socialListeningItem.deleteMany({ where: { monitorId: id, organizationId } }),
        db.socialListeningMonitor.delete({ where: { id } }),
    ]);

    return NextResponse.json({ success: true });
}
