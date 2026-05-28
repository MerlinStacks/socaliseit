import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createRouteLogger } from '@/lib/logger';

const log = createRouteLogger('API', '/api/seb/chat/sessions');

export async function GET() {
    try {
        const session = await auth();
        const organizationId = session?.user?.currentOrganizationId;
        if (!session?.user?.id || !organizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const sessions = await db.sebChatSession.findMany({
            where: { organizationId, userId: session.user.id },
            orderBy: { updatedAt: 'desc' },
            take: 50,
            include: { messages: { orderBy: { createdAt: 'asc' }, take: 80 } },
        });

        return NextResponse.json({ sessions });
    } catch (error) {
        log.error({ err: error }, 'Failed to fetch Seb chat sessions');
        return NextResponse.json({ error: 'Failed to fetch Seb chat sessions' }, { status: 500 });
    }
}
