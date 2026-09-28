// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@/generated/prisma/client';

const mocks = vi.hoisted(() => ({
    db: {
        $transaction: vi.fn(), $queryRaw: vi.fn(),
        socialListeningMonitor: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
        socialListeningItem: { upsert: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
        organizationMember: { findMany: vi.fn() }, notificationSettings: { findMany: vi.fn() },
        notification: { createMany: vi.fn() },
        mention: { findMany: vi.fn() }, comment: { findMany: vi.fn() },
        review: { findMany: vi.fn() }, directMessage: { findMany: vi.fn() },
    },
}));
vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn() } }));
vi.mock('@/lib/auth/with-permission', () => ({
    DEFAULT_ROLE_PERMISSIONS: { OWNER: ['discovery.view'], VIEWER: ['discovery.view'] },
    PERMISSIONS: { DISCOVERY_VIEW: 'discovery.view' },
}));
vi.mock('@/lib/services/listening-api', () => ({ ListeningApiError: class extends Error {} }));
import { flushListeningAlerts, ingestListeningItem } from '../services/listening-alerts';
import { updateListeningMonitor } from '../services/listening-management';
import { syncListeningItems } from '../services/social-listening';

const enabledAt = new Date('2026-01-01');
let monitor: Record<string, unknown>;
let items: Record<string, Record<string, unknown>>;
let notifications: unknown[];

function candidate(sourceId = 'one', content = 'brand broken? private text'): Prisma.SocialListeningItemUpsertArgs {
    return {
        where: { monitorId_sourceType_sourceId: { monitorId: 'm', sourceType: 'dm', sourceId } },
        create: { organizationId: 'org', monitorId: 'm', platform: 'INSTAGRAM', sourceType: 'dm', sourceId,
            content, matchedKeywords: ['brand'], occurredAt: new Date() },
        update: { content },
    };
}

beforeEach(() => {
    vi.resetAllMocks();
    monitor = { id: 'm', organizationId: 'org', name: 'Brand', isActive: true, alertsEnabled: true,
        alertsEnabledAt: enabledAt, nextAlertAt: null, alertCooldownMinutes: 60,
        keywords: ['brand'], excludedTerms: [], platforms: [], matchMode: 'phrase' };
    items = {};
    notifications = [];
    // Stateful transaction double: serialized execution and rollback. PostgreSQL
    // supplies the actual serialization via the asserted FOR UPDATE statement.
    let queue = Promise.resolve();
    mocks.db.$transaction.mockImplementation((run) => {
        const task = queue.then(async () => {
            const snapshot = structuredClone({ monitor, items, notifications });
            try { return await run(mocks.db); }
            catch (error) { ({ monitor, items, notifications } = snapshot); throw error; }
        });
        queue = task.then(() => undefined, () => undefined);
        return task;
    });
    mocks.db.socialListeningMonitor.findMany.mockResolvedValue([{ id: 'm' }]);
    mocks.db.socialListeningMonitor.findFirst.mockImplementation(async ({ where }) => where.organizationId === 'org' ? monitor : null);
    mocks.db.socialListeningMonitor.update.mockImplementation(async ({ data }) => Object.assign(monitor, data));
    mocks.db.socialListeningItem.upsert.mockImplementation(async ({ create, update }) => {
        const key = create.sourceId;
        if (items[key]) Object.assign(items[key], update);
        else items[key] = { ...create };
        return items[key];
    });
    mocks.db.socialListeningItem.count.mockImplementation(async ({ where }) => Object.values(items).filter((item) =>
        item.alertPending && (!where.OR || item.sentiment === 'negative' || item.isQuestion === true)).length);
    mocks.db.socialListeningItem.updateMany.mockImplementation(async () => {
        for (const item of Object.values(items)) item.alertPending = false;
    });
    mocks.db.organizationMember.findMany.mockResolvedValue([
        { userId: 'owner', role: 'OWNER' }, { userId: 'veto', role: 'VIEWER' },
        { userId: 'denied', role: 'CUSTOM', customRole: { permissions: [] } },
        { userId: 'allowed', role: 'CUSTOM', customRole: { permissions: [{ permission: { code: 'discovery.view' } }] } },
    ]);
    mocks.db.notificationSettings.findMany.mockResolvedValue([{ userId: 'veto' }]);
    mocks.db.notification.createMany.mockImplementation(async ({ data }) => { notifications.push(...data); });
});

describe('durable listening batches', () => {
    it.each([
        ['brand is amazing', 'positive'], ['brand announcement', 'neutral'],
    ])('stores %s without pending status or notifications', async (content, sentiment) => {
        await ingestListeningItem(candidate('one', content));
        expect(items.one).toMatchObject({ sentiment, isQuestion: false, alertPending: false });
        await flushListeningAlerts('org');
        expect(notifications).toEqual([]);
        expect(monitor.nextAlertAt).toBeNull();
    });
    it.each(['brand is broken', 'brand update?', 'brand amazing?', 'brand broken?'])('counts eligible %s exactly once per recipient', async (content) => {
        await ingestListeningItem(candidate('one', content));
        expect(items.one.alertPending).toBe(true);
        await flushListeningAlerts('org');
        expect(notifications).toHaveLength(2);
        for (const notification of notifications) expect(notification).toMatchObject({ message: '1 new match for Brand.' });
        await flushListeningAlerts('org');
        expect(notifications).toHaveLength(2);
    });
    it('cancels pending after non-question positive reanalysis and never re-arms it', async () => {
        await ingestListeningItem(candidate());
        await ingestListeningItem(candidate('one', 'brand amazing'));
        expect(items.one).toMatchObject({ sentiment: 'positive', isQuestion: false, alertPending: false });
        await flushListeningAlerts('org');
        expect(notifications).toEqual([]);
        await ingestListeningItem(candidate());
        expect(items.one.alertPending).toBe(false);
    });
    it('never arms a previously ineligible item after it becomes negative', async () => {
        await ingestListeningItem(candidate('one', 'brand announcement'));
        await ingestListeningItem(candidate('one', 'brand broken'));
        expect(items.one).toMatchObject({ sentiment: 'negative', alertPending: false });
        await flushListeningAlerts('org');
        expect(notifications).toEqual([]);
    });
    it('discards stale ineligible markers without delivery or cooldown', async () => {
        await ingestListeningItem(candidate('one', 'brand announcement'));
        items.one.alertPending = true; // Old ingestion/reanalysis code.
        await flushListeningAlerts('org');
        expect(items.one.alertPending).toBe(false);
        expect(notifications).toEqual([]);
        expect(monitor.nextAlertAt).toBeNull();
    });
    it('counts only eligible items in a mixed batch and consumes obsolete markers', async () => {
        await ingestListeningItem(candidate());
        await ingestListeningItem(candidate('positive', 'brand amazing'));
        items.positive.alertPending = true;
        await flushListeningAlerts('org');
        expect(notifications).toHaveLength(2);
        for (const notification of notifications) expect(notification).toMatchObject({ message: '1 new match for Brand.' });
        expect(items.positive.alertPending).toBe(false);
    });
    it('suppresses pre-enable dates, accepts the boundary, and cancels newly discovered historical dates', async () => {
        await ingestListeningItem(candidate('before'), new Date(enabledAt.getTime() - 1));
        await ingestListeningItem(candidate('boundary'), enabledAt);
        await ingestListeningItem(candidate('undated'));
        await ingestListeningItem(candidate('undated'), new Date(enabledAt.getTime() - 1));
        expect(items.before.alertPending).toBe(false);
        expect(items.boundary.alertPending).toBe(true);
        expect(items.undated.alertPending).toBe(false);
        await flushListeningAlerts('org');
        for (const notification of notifications) expect(notification).toMatchObject({ message: '1 new match for Brand.' });
    });
    it('evaluates current membership, permissions and veto at flush time', async () => {
        await ingestListeningItem(candidate());
        mocks.db.organizationMember.findMany.mockResolvedValue([
            { userId: 'allowed', role: 'CUSTOM', customRole: { permissions: [] } }, // Permission revoked.
            { userId: 'missing-role', role: 'CUSTOM', customRole: null },
            { userId: 'veto', role: 'OWNER' }, // Even owners honor the veto.
            { userId: 'new-viewer', role: 'VIEWER' },
        ]); // Original owner is no longer a member.
        await flushListeningAlerts('org');
        expect(notifications).toEqual([expect.objectContaining({ userId: 'new-viewer' })]);
        expect(mocks.db.notificationSettings.findMany).toHaveBeenCalledWith({
            where: { organizationId: 'org', listeningAlerts: false }, select: { userId: true },
        });
    });
    it('ingests connected items through shared analysis and preserves pending state across read changes', async () => {
        mocks.db.socialListeningMonitor.findMany.mockImplementation(async () => [monitor]);
        mocks.db.mention.findMany.mockResolvedValue([]);
        mocks.db.comment.findMany.mockResolvedValue([]);
        mocks.db.review.findMany.mockResolvedValue([]);
        mocks.db.directMessage.findMany.mockResolvedValue([
            { id: 'dm', socialAccountId: 'account', socialAccount: { platform: 'INSTAGRAM' }, text: 'ＢＲＡＮＤ broken?', createdAt: new Date() },
            { id: 'unrelated', socialAccountId: 'account', socialAccount: { platform: 'INSTAGRAM' }, text: 'branding', createdAt: new Date() },
        ]);
        expect(await syncListeningItems('org')).toEqual({ synced: 1, monitors: 1 });
        expect(items.dm).toMatchObject({ isQuestion: true, sentiment: 'negative', alertPending: true });
        items.dm.isRead = true;
        await syncListeningItems('org');
        expect(items.dm).toMatchObject({ isRead: true, alertPending: true });
        await flushListeningAlerts('org');
        expect(notifications).toHaveLength(2);
    });
    it('marks only first eligible insert and batches concurrent/retried ingestion and flushes', async () => {
        await Promise.all([ingestListeningItem(candidate()), ingestListeningItem(candidate())]);
        expect(items.one).toMatchObject({ alertPending: true, sentiment: 'negative', isQuestion: true });
        await Promise.all([flushListeningAlerts('org'), flushListeningAlerts('org')]);
        expect(notifications).toHaveLength(2);
        expect(notifications).toEqual([
            expect.objectContaining({ userId: 'owner', link: '/listening?monitorId=m', message: '1 new match for Brand.' }),
            expect.objectContaining({ userId: 'allowed' }),
        ]);
        expect(JSON.stringify(notifications)).not.toContain('private text');
        await ingestListeningItem(candidate());
        expect(items.one.alertPending).toBe(false);
        expect(mocks.db.$queryRaw.mock.calls[0][0].join('')).toContain('FOR UPDATE');
        expect(mocks.db.$queryRaw.mock.calls[0].slice(1)).toEqual(['m', 'org']);
        expect(mocks.db.organizationMember.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org' } }));
    });
    it('suppresses dated history, disabled inserts and stored baselines; undated crawls use first discovery', async () => {
        await ingestListeningItem(candidate('historical'), new Date('2025-12-31'));
        expect(items.historical.alertPending).toBe(false);
        monitor.alertsEnabled = false;
        await ingestListeningItem(candidate('baseline'));
        monitor.alertsEnabled = true;
        await ingestListeningItem(candidate('baseline'));
        await ingestListeningItem(candidate('undated'));
        expect(items.baseline.alertPending).toBe(false);
        expect(items.undated.alertPending).toBe(true);
    });
    it('retains pending during cooldown and flushes on an empty later sync', async () => {
        await ingestListeningItem(candidate());
        monitor.nextAlertAt = new Date(Date.now() + 60_000);
        await flushListeningAlerts('org');
        expect(items.one.alertPending).toBe(true);
        expect(notifications).toHaveLength(0);
        monitor.nextAlertAt = new Date(0);
        await flushListeningAlerts('org');
        expect(items.one.alertPending).toBe(false);
        expect(notifications).toHaveLength(2);
    });
    it('rolls back notification creation and markers on failure then safely retries', async () => {
        await ingestListeningItem(candidate());
        mocks.db.socialListeningMonitor.update.mockRejectedValueOnce(new Error('commit failed'));
        await expect(flushListeningAlerts('org')).rejects.toThrow('commit failed');
        expect(notifications).toHaveLength(0);
        expect(items.one.alertPending).toBe(true);
        await flushListeningAlerts('org');
        expect(notifications).toHaveLength(2);
    });
    it('cancels backlog on disable and starts a new epoch without replay', async () => {
        await ingestListeningItem(candidate());
        await updateListeningMonitor('org', 'm', { alertsEnabled: false });
        expect(items.one.alertPending).toBe(false);
        expect(monitor.alertsEnabledAt).toBeNull();
        await updateListeningMonitor('org', 'm', { alertsEnabled: true });
        expect(monitor.alertsEnabledAt).toBeInstanceOf(Date);
        await ingestListeningItem(candidate());
        await flushListeningAlerts('org');
        expect(notifications).toHaveLength(0);
    });
    it('pausing cancels pending and resuming starts a new enable epoch; ordinary edits preserve it', async () => {
        await ingestListeningItem(candidate());
        await updateListeningMonitor('org', 'm', { name: 'Renamed', alertsEnabled: true });
        expect(monitor.alertsEnabledAt).toEqual(enabledAt);
        expect(items.one.alertPending).toBe(true);
        await updateListeningMonitor('org', 'm', { isActive: false });
        expect(items.one.alertPending).toBe(false);
        expect(monitor.alertsEnabledAt).toBeNull();
        await updateListeningMonitor('org', 'm', { isActive: true });
        expect((monitor.alertsEnabledAt as Date).getTime()).toBeGreaterThan(enabledAt.getTime());
    });
    it('consumes batches with no current eligible members without replay', async () => {
        await ingestListeningItem(candidate());
        mocks.db.organizationMember.findMany.mockResolvedValue([]);
        await flushListeningAlerts('org');
        expect(items.one.alertPending).toBe(false);
        expect(notifications).toHaveLength(0);
    });
    it('rejects foreign tenant ingestion and rechecks current relevance under lock', async () => {
        const foreign = candidate();
        foreign.create.organizationId = 'other';
        await ingestListeningItem(foreign);
        monitor.excludedTerms = ['brand'];
        await ingestListeningItem(candidate());
        expect(items).toEqual({});
    });
});
