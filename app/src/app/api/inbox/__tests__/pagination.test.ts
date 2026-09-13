// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { collaborationQuerySchema, cursorScope, decodeCursor, historyPage } from '../collaboration/pagination';

const key = { organizationId: 'org', socialAccountId: 'a', type: 'DM', entityId: 'thread' };
const scope = cursorScope(key, 'notes');
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
describe('opaque collaboration cursor validation', () => {
    it('accepts independent optional cursors without changing the item schema contract', () => {
        const item = { id: 'local', type: 'dm', socialAccountId: 'a' };
        expect(collaborationQuerySchema.parse(item)).toEqual(item);
        expect(collaborationQuerySchema.safeParse({ ...item, noteCursor: '!' }).success).toBe(false);
        expect(collaborationQuerySchema.safeParse({ ...item, activityCursor: '' }).success).toBe(false);
    });
    it('rejects wrong versions, invalid dates, fields, oversized IDs, scope and noncanonical encoding', () => {
        const valid = { v: 1, scope, createdAt: '2026-09-13T00:00:00.000Z', id: 'id' };
        for (const invalid of [{ v: 2 }, { createdAt: '2026-02-30T00:00:00.000Z' }, { createdAt: 'tomorrow' },
            { id: '' }, { id: 'x'.repeat(513) }, { extra: true }, { scope: cursorScope(key, 'activity') }]) {
            expect(() => decodeCursor(encode({ ...valid, ...invalid }), scope)).toThrow('Invalid collaboration cursor');
        }
        expect(() => decodeCursor(`${encode(valid)}=`, scope)).toThrow();
        expect(decodeCursor(undefined, scope)).toBeUndefined();
        expect(decodeCursor(encode(valid), scope)).toEqual({ id: 'id', createdAt: new Date(valid.createdAt) });
    });
    it('uses the last delivered row, with no next cursor on empty or exactly full terminal pages', () => {
        const rows = Array.from({ length: 51 }, (_, i) => ({ id: `id${i}`, createdAt: new Date('2026-09-13') }));
        expect(historyPage([], scope)).toEqual({ items: [], nextCursor: null });
        expect(historyPage(rows.slice(0, 50), scope).nextCursor).toBeNull();
        const page = historyPage(rows, scope);
        expect(page.items).toHaveLength(50);
        expect(decodeCursor(page.nextCursor!, scope)).toEqual(rows[49]);
    });
});
