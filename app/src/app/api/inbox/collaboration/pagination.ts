import { createHash } from 'node:crypto';
import { z } from 'zod';
import { collaborationItemSchema } from './service';
import { InboxError } from '../workflow/service';

const token = z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/);
export const collaborationQuerySchema = collaborationItemSchema.extend({
    noteCursor: token.optional(), activityCursor: token.optional(),
});
const cursorSchema = z.object({
    v: z.literal(1), scope: z.string().regex(/^[a-f0-9]{64}$/),
    createdAt: z.string().datetime().refine((value) => {
        const date = new Date(value);
        return Number.isFinite(date.getTime()) && date.toISOString() === value;
    }),
    id: z.string().min(1).max(512),
}).strict();
type Position = { createdAt: Date; id: string };

/** Canonical DM entity key, not the changing latest local message ID. */
export function cursorScope(key: { organizationId: string; socialAccountId: string; type: string; entityId: string }, stream: 'notes' | 'activity') {
    return createHash('sha256').update(JSON.stringify([key.organizationId, key.socialAccountId, key.type, key.entityId, stream])).digest('hex');
}

export function decodeCursor(value: string | undefined, scope: string): Position | undefined {
    if (value === undefined) return undefined;
    try {
        token.parse(value);
        const bytes = Buffer.from(value, 'base64url');
        if (bytes.toString('base64url') !== value) throw new Error('Noncanonical cursor');
        const parsed = cursorSchema.parse(JSON.parse(bytes.toString('utf8')));
        if (parsed.scope !== scope) throw new Error('Cursor scope mismatch');
        return { id: parsed.id, createdAt: new Date(parsed.createdAt) };
    } catch { throw new InboxError('Invalid collaboration cursor'); }
}

/** A cursor is a position, not an authorization grant; every query remains tenant/workflow scoped. */
export function historyWhere(organizationId: string, workflowId: string, cursor?: Position) {
    return { organizationId, workflowId, ...(cursor ? { OR: [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ] } : {}) };
}

export function historyPage<T extends Position>(rows: T[], scope: string) {
    const items = rows.slice(0, 50);
    const last = items.at(-1);
    const nextCursor = rows.length > 50 && last ? Buffer.from(JSON.stringify({
        v: 1, scope, createdAt: last.createdAt.toISOString(), id: last.id,
    })).toString('base64url') : null;
    return { items, nextCursor };
}
