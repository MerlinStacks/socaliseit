/** Session-scoped authorization and consistent listening API errors. */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { hasPermission, PERMISSIONS } from '@/lib/auth/with-permission';
import { logger } from '@/lib/logger';

export class ListeningApiError extends Error {
    constructor(message: string, public status: number) { super(message); }
}

export async function listeningApi(manage: boolean, handler: (organizationId: string) => Promise<NextResponse>) {
    try {
        const session = await auth();
        const organizationId = session?.user?.currentOrganizationId;
        if (!organizationId || !session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const permission = manage ? PERMISSIONS.DISCOVERY_MANAGE : PERMISSIONS.DISCOVERY_VIEW;
        if (!await hasPermission(organizationId, session.user.id, permission)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        return await handler(organizationId);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid input', issues: error.issues }, { status: 400 });
        }
        if (error instanceof ListeningApiError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
        logger.error({ error }, 'Listening API failed');
        return NextResponse.json({ error: 'Listening request failed' }, { status: 500 });
    }
}

export async function listeningBody(request: Request): Promise<unknown> {
    try { return await request.json(); }
    catch { throw new ListeningApiError('Invalid JSON', 400); }
}
