import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parse-json-body';
import { InboxError, updateWorkflow, workflowItemSchema } from './service';
import { collaborationAccess } from './access';

const schema = z.union([workflowItemSchema, z.object({ items: z.array(workflowItemSchema).min(1).max(100) }).strict()]);

export async function PATCH(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session.user.currentOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const organizationId = session.user.currentOrganizationId;
        const { data: body, error } = await parseJsonBody(request);
        if (error) return error;
        const input = schema.parse(body);
        const result = await db.$transaction(async (tx) => {
            const { actor } = await collaborationAccess(tx, organizationId, session.user.id, true);
            const results = [];
            for (const item of 'items' in input ? input.items : [input]) {
                results.push(await updateWorkflow(tx, organizationId, item, new Date(), actor));
            }
            return results;
        }, { isolationLevel: 'Serializable', timeout: 15000 });
        return NextResponse.json({ success: true, data: 'items' in input ? result : result[0] });
    } catch (error) {
        if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid request', details: error.issues }, { status: 400 });
        if (error instanceof InboxError) return NextResponse.json({ error: error.message }, { status: error.status });
        if (typeof error === 'object' && error && 'code' in error && error.code === 'P2034') {
            return NextResponse.json({ error: 'Workflow changed concurrently; retry the request' }, { status: 409 });
        }
        logger.error({ error }, 'Inbox workflow update failed');
        return NextResponse.json({ error: 'Failed to update workflow' }, { status: 500 });
    }
}
