import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { collaborationAccess } from '../workflow/access';
import { InboxError, resolveWorkflowItem } from '../workflow/service';
import { exchangePresence, PresenceCapacityError, PresenceUnavailableError } from './redis';
import { presenceHeartbeatSchema, presenceItemSchema, presenceReleaseSchema, type PresenceOperation } from './service';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };
const MAX_BODY_BYTES = 4096;

/** Enforce an actual byte limit, including requests without Content-Length. */
async function readBody(request: NextRequest): Promise<unknown> {
    if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new InboxError('Request body too large', 413);
    const reader = request.body?.getReader();
    if (!reader) throw new InboxError('Invalid JSON');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_BODY_BYTES) {
                void reader.cancel().catch(() => undefined);
                throw new InboxError('Request body too large', 413);
            }
            chunks.push(value);
        }
    } finally { reader.releaseLock(); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new InboxError('Invalid JSON'); }
}

async function handle(request: NextRequest, method: 'get' | 'put' | 'delete') {
    try {
        const session = await auth();
        if (!session?.user?.id || !session.user.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
        }
        const organizationId = session.user.currentOrganizationId;
        let raw: unknown;
        if (method === 'get') {
            const params = new URL(request.url).searchParams;
            if ([...params.keys()].length !== new Set(params.keys()).size) throw new InboxError('Duplicate query parameters');
            raw = Object.fromEntries(params);
        } else raw = await readBody(request);
        let input: z.infer<typeof presenceItemSchema>;
        let operation: PresenceOperation;
        if (method === 'put') {
            const heartbeat = presenceHeartbeatSchema.parse(raw);
            input = heartbeat;
            operation = { kind: 'put', tabId: heartbeat.tabId, state: heartbeat.state };
        } else if (method === 'delete') {
            const release = presenceReleaseSchema.parse(raw);
            input = release;
            operation = { kind: 'delete', tabId: release.tabId };
        } else {
            input = presenceItemSchema.parse(raw);
            operation = { kind: 'get' };
        }
        const { actor, key } = await db.$transaction(async (tx) => {
            const { actor } = await collaborationAccess(tx, organizationId, session.user.id,
                operation.kind === 'put' && operation.state !== 'viewing');
            const { key } = await resolveWorkflowItem(tx, organizationId, input);
            return { actor, key };
        });
        const data = await exchangePresence(key, actor, operation);
        return NextResponse.json(method === 'delete' ? { success: true } : { data }, { headers });
    } catch (error) {
        if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid request', details: error.issues }, { status: 400, headers });
        if (error instanceof InboxError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
        if (error instanceof PresenceUnavailableError || error instanceof PresenceCapacityError) {
            return NextResponse.json({ error: error.message }, {
                status: error instanceof PresenceCapacityError ? 429 : 503,
                headers: { ...headers, 'Retry-After': error instanceof PresenceCapacityError ? '45' : '1' },
            });
        }
        logger.error({ error }, 'Inbox presence failed');
        return NextResponse.json({ error: 'Inbox presence failed' }, { status: 500, headers });
    }
}

export async function GET(request: NextRequest) { return handle(request, 'get'); }
export async function PUT(request: NextRequest) { return handle(request, 'put'); }
export async function DELETE(request: NextRequest) { return handle(request, 'delete'); }
