import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createRouteLogger } from '@/lib/logger';

const log = createRouteLogger('API', '/api/seb/chat/sessions/[id]');

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        const organizationId = session?.user?.currentOrganizationId;
        if (!session?.user?.id || !organizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const chatSession = await db.sebChatSession.findFirst({
            where: { id, organizationId, userId: session.user.id },
            select: { id: true },
        });
        if (!chatSession) {
            return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
        }

        await db.sebChatSession.delete({ where: { id } });
        return NextResponse.json({ ok: true });
    } catch (error) {
        log.error({ err: error }, 'Failed to delete Seb chat session');
        return NextResponse.json({ error: 'Failed to delete Seb chat session' }, { status: 500 });
    }
}
