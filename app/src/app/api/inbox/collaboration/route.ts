import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parse-json-body';
import { collaborationAccess } from '../workflow/access';
import { InboxError, resolveWorkflowItem } from '../workflow/service';
import { appendNote, noteSchema, serializeNote } from './service';
import { collaborationQuerySchema, cursorScope, decodeCursor, historyPage, historyWhere } from './pagination';

function failure(error: unknown) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid request', details: error.issues }, { status: 400 });
    if (error instanceof InboxError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (typeof error === 'object' && error && 'code' in error && ['P2034', 'P2002'].includes(String(error.code))) {
        return NextResponse.json({ error: 'Inbox changed concurrently; retry with the same requestId' }, { status: 409 });
    }
    logger.error({ error }, 'Inbox collaboration failed');
    return NextResponse.json({ error: 'Inbox collaboration failed' }, { status: 500 });
}

/** Independent keyset pages of 50 notes and activities, newest first with ID tie-break. */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session.user.currentOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const organizationId = session.user.currentOrganizationId;
        const input = collaborationQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
        const data = await db.$transaction(async (tx) => {
            const { canWrite } = await collaborationAccess(tx, organizationId, session.user.id);
            const { key } = await resolveWorkflowItem(tx, organizationId, input);
            const noteScope = cursorScope(key, 'notes');
            const activityScope = cursorScope(key, 'activity');
            const noteCursor = decodeCursor(input.noteCursor, noteScope);
            const activityCursor = decodeCursor(input.activityCursor, activityScope);
            const workflow = await tx.inboxWorkflow.findUnique({ where: { organizationId_type_entityId_socialAccountId: key } });
            if (!workflow) return { notes: [], activity: [], canWrite,
                pagination: { notes: { nextCursor: null }, activity: { nextCursor: null } } };
            const orderBy = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
            const notes = historyPage(await tx.inboxNote.findMany({
                where: historyWhere(organizationId, workflow.id, noteCursor), orderBy, take: 51 }), noteScope);
            const activity = historyPage(await tx.inboxActivity.findMany({
                where: historyWhere(organizationId, workflow.id, activityCursor), orderBy, take: 51,
                select: { id: true, actorName: true, kind: true, description: true, createdAt: true } }), activityScope);
            return { notes: notes.items.map(serializeNote), activity: activity.items, canWrite,
                pagination: { notes: { nextCursor: notes.nextCursor }, activity: { nextCursor: activity.nextCursor } } };
        }, { isolationLevel: 'Serializable' });
        return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session.user.currentOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const organizationId = session.user.currentOrganizationId;
        const { data: body, error } = await parseJsonBody(request);
        if (error) return error;
        const input = noteSchema.parse(body);
        // Serializable conflicts / racing unique inserts roll back all effects before retry.
        for (let attempt = 0; ; attempt++) {
            try {
                const data = await db.$transaction(async (tx) => {
                    const { actor } = await collaborationAccess(tx, organizationId, session.user.id, true);
                    return appendNote(tx, organizationId, actor, input);
                }, { isolationLevel: 'Serializable', timeout: 15000 });
                return NextResponse.json({ success: true, data });
            } catch (error) {
                if (attempt < 2 && typeof error === 'object' && error && 'code' in error
                    && ['P2034', 'P2002'].includes(String(error.code))) continue;
                throw error;
            }
        }
    } catch (error) { return failure(error); }
}
