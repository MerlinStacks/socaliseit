// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    hasPermission: vi.fn(),
    listQueues: vi.fn(),
    listQueueOptions: vi.fn(),
    saveQueue: vi.fn(),
    deleteQueue: vi.fn(),
    createBatch: vi.fn(),
    parseCsvRows: vi.fn(),
    listBatches: vi.fn(),
    queueFind: vi.fn(), timeline: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/auth/with-permission', () => ({
    auth: mocks.auth,
    hasPermission: mocks.hasPermission,
    PERMISSIONS: { SETTINGS_VIEW: 'settings.view', SETTINGS_EDIT: 'settings.edit', POSTS_SCHEDULE: 'posts.schedule', POSTS_CREATE: 'posts.create' },
}));
vi.mock('@/lib/logger', () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/publishing-queue/service', () => ({
    listQueues: mocks.listQueues,
    listQueueOptions: mocks.listQueueOptions,
    saveQueue: mocks.saveQueue,
    deleteQueue: mocks.deleteQueue,
    getQueueTimeline: mocks.timeline,
}));
vi.mock('@/lib/db', () => ({ db: { publishingQueue: { findFirst: mocks.queueFind } } }));
vi.mock('@/lib/publishing-queue/bulk', () => ({
    createBatch: mocks.createBatch,
    parseCsvRows: mocks.parseCsvRows,
    listBatches: mocks.listBatches,
}));

import { GET, POST } from '@/app/api/publishing-queues/route';
import { POST as bulkPost } from '@/app/api/publishing-queues/bulk/route';
import { GET as queueDetail } from '@/app/api/publishing-queues/[id]/route';

const SLOT = { daysOfWeek: [1, 2, 3, 4, 5], time: '09:00' };

function jsonRequest(body: unknown, url = 'http://localhost/api/publishing-queues') {
    return new NextRequest(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'user', currentOrganizationId: 'org' } });
    mocks.hasPermission.mockResolvedValue(true);
    mocks.listQueues.mockResolvedValue([]);
    mocks.listQueueOptions.mockResolvedValue([]);
    mocks.listBatches.mockResolvedValue([]);
});

describe('GET /api/publishing-queues', () => {
    it('rejects anonymous callers', async () => {
        mocks.auth.mockResolvedValue(null);
        expect((await GET(new NextRequest('http://localhost/api/publishing-queues'))).status).toBe(401);
    });

    it('rejects a role that cannot view settings', async () => {
        mocks.hasPermission.mockResolvedValue(false);
        expect((await GET(new NextRequest('http://localhost/api/publishing-queues'))).status).toBe(403);
    });

    it('returns the queue summaries', async () => {
        mocks.listQueues.mockResolvedValue([{ id: 'q1', label: '', slotCount: 3 }]);
        const body = await GET(new NextRequest('http://localhost/api/publishing-queues')).then(r => r.json());
        expect(body.data[0].id).toBe('q1');
    });

    it('returns profiles and their labels when asked', async () => {
        await GET(new NextRequest('http://localhost/api/publishing-queues?accounts=true'));
        expect(mocks.listQueueOptions).toHaveBeenCalledWith('org');
    });
});

describe('POST /api/publishing-queues', () => {
    it('creates a queue with the validated slot list', async () => {
        mocks.saveQueue.mockResolvedValue({ id: 'q1' });
        const response = await POST(jsonRequest({ socialAccountId: 'acct', label: 'weekends', slots: [SLOT] }));
        expect(response.status).toBe(201);
        expect(mocks.saveQueue).toHaveBeenCalledWith(expect.objectContaining({
            organizationId: 'org', socialAccountId: 'acct', label: 'weekends',
        }));
    });

    it('rejects malformed slot times with 400 before the service runs', async () => {
        const response = await POST(jsonRequest({ socialAccountId: 'acct', slots: [{ daysOfWeek: [1], time: '9am' }] }));
        expect(response.status).toBe(400);
        expect(mocks.saveQueue).not.toHaveBeenCalled();
    });

    it('rejects a slot list with no days selected', async () => {
        const response = await POST(jsonRequest({ socialAccountId: 'acct', slots: [{ daysOfWeek: [], time: '09:00' }] }));
        expect(response.status).toBe(400);
    });

    it('passes a uniqueness clash through as 409', async () => {
        const conflict = Object.assign(new Error('That profile already has a queue with this label'), { status: 409 });
        mocks.saveQueue.mockRejectedValue(conflict);
        expect((await POST(jsonRequest({ socialAccountId: 'acct', slots: [SLOT] }))).status).toBe(409);
    });

    it('refuses a non-object body', async () => {
        expect((await POST(jsonRequest(['not', 'an', 'object']))).status).toBe(400);
    });
});

describe('POST /api/publishing-queues/bulk', () => {
    it('requires creation permission separately from scheduling permission', async () => {
        mocks.hasPermission.mockImplementation(async (_org, _user, permission) => permission !== 'posts.create');
        expect((await bulkPost(jsonRequest({ kind: 'LIBRARY', items: [{ caption: 'hello' }], socialAccountIds: ['acct'] }))).status).toBe(403);
        expect(mocks.createBatch).not.toHaveBeenCalled();
    });
    it('accepts a library batch and reports it as started', async () => {
        mocks.createBatch.mockResolvedValue({ batchId: 'b1', totalItems: 2 });
        const response = await bulkPost(jsonRequest({
            kind: 'LIBRARY',
            items: [{ mediaId: 'm1', caption: 'a' }, { mediaId: 'm2', caption: 'b' }],
            socialAccountIds: ['acct'],
            mode: 'LAST',
        }, 'http://localhost/api/publishing-queues/bulk'));
        expect(response.status).toBe(202);
        expect(mocks.createBatch).toHaveBeenCalledWith(expect.objectContaining({ kind: 'LIBRARY', mode: 'LAST' }));
    });

    it('routes CSV text through the parser', async () => {
        mocks.parseCsvRows.mockResolvedValue({ rows: [{ caption: 'hi' }], warnings: [], errors: [] });
        mocks.createBatch.mockResolvedValue({ batchId: 'b1', totalItems: 1 });
        const response = await bulkPost(jsonRequest({ kind: 'CSV', csv: 'caption\nhi', socialAccountIds: ['acct'] }, 'http://localhost/api/publishing-queues/bulk'));
        expect(response.status).toBe(202);
        expect(mocks.createBatch).toHaveBeenCalledWith(expect.objectContaining({ kind: 'CSV' }));
    });

    it('rejects an unknown kind', async () => {
        const response = await bulkPost(jsonRequest({ kind: 'MYSTERY', socialAccountIds: ['acct'] }, 'http://localhost/api/publishing-queues/bulk'));
        expect(response.status).toBe(400);
        expect(mocks.createBatch).not.toHaveBeenCalled();
    });

    it('rejects a batch with no content', async () => {
        const response = await bulkPost(jsonRequest({ kind: 'LIBRARY', items: [], socialAccountIds: ['acct'] }, 'http://localhost/api/publishing-queues/bulk'));
        expect(response.status).toBe(400);
    });

    it('requires at least one target profile', async () => {
        const response = await bulkPost(jsonRequest({ kind: 'LIBRARY', items: [{ caption: 'a', mediaId: 'm1' }], socialAccountIds: [] }, 'http://localhost/api/publishing-queues/bulk'));
        expect(response.status).toBe(400);
    });
});

it('reads a disabled queue by its authorized id, without falling back to another label', async () => {
    mocks.queueFind.mockResolvedValue({ id: 'disabled', enabled: false, label: 'promos', socialAccountId: 'acct', slots: [] });
    mocks.timeline.mockResolvedValue({ items: [], preview: [] });
    const response = await queueDetail(new NextRequest('http://localhost/api/publishing-queues/disabled'), { params: Promise.resolve({ id: 'disabled' }) });
    expect(response.status).toBe(200);
    expect(mocks.timeline).toHaveBeenCalledWith('org', { queueId: 'disabled' });
});
