// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { calendarNote: { findMany: mocks.findMany } } }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
import { GET } from '../notes/route';

beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'viewer', currentOrganizationId: 'org' } });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('calendar notes use the same viewer-local range as posts', () => {
    it('queries the entire Sydney day and retains workspace/privacy filters on a UTC server', async () => {
        vi.stubEnv('TZ', 'UTC');
        mocks.findMany.mockResolvedValueOnce([{ id: 'note', title: 'Morning launch', date: new Date('2026-09-28T14:15:00Z'),
            description: null, color: 'blue', isPrivate: true, createdById: 'viewer' }]);
        const response = await GET(new NextRequest('http://localhost/api/calendar/notes?start=2026-09-29&end=2026-09-29&timezone=Australia%2FSydney'));
        expect(response.status).toBe(200);
        expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
            organizationId: 'org', date: { gte: new Date('2026-09-28T14:00:00Z'), lte: new Date('2026-09-29T13:59:59.999Z') },
            OR: [{ isPrivate: false }, { isPrivate: true, createdById: 'viewer' }],
        } }));
        expect((await response.json()).notes['2026-09-29'][0].id).toBe('note');
    });
    it('rejects invalid timezones before querying notes', async () => {
        const response = await GET(new NextRequest('http://localhost/api/calendar/notes?timezone=Not%2FA_Timezone'));
        expect(response.status).toBe(400);
        expect(mocks.findMany).not.toHaveBeenCalled();
    });
});
