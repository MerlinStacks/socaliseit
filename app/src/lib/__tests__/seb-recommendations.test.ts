import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ updateMany: vi.fn(), info: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { sebRecommendation: { updateMany: mocks.updateMany } } }));
vi.mock('@/lib/logger', () => ({ logger: { info: mocks.info } }));
import { expireStaleSebRecommendations, planSebRecommendationWrites, sebRecommendationKey } from '../seb-recommendations';

const now = new Date('2026-11-02T12:00:00.000Z');
const days = (count: number) => count * 24 * 60 * 60 * 1000;
const where = () => mocks.updateMany.mock.calls[0][0].where as
    { status: { in: string[] }; updatedAt: { lt: Date } };

describe('expireStaleSebRecommendations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.updateMany.mockResolvedValue({ count: 0 });
    });

    it('dismisses advice untouched for a week', async () => {
        await expireStaleSebRecommendations(now);
        expect(where().status.in).toEqual(['NEW', 'IN_PROGRESS']);
        expect(where().updatedAt.lt).toEqual(new Date(now.getTime() - days(7)));
        expect(mocks.updateMany.mock.calls[0][0].data).toEqual({ status: 'DISMISSED' });
    });

    it('honours a custom retention window', async () => {
        await expireStaleSebRecommendations(now, 30);
        expect(where().updatedAt.lt).toEqual(new Date(now.getTime() - days(30)));
    });

    it('reports how much advice aged out', async () => {
        mocks.updateMany.mockResolvedValue({ count: 214 });
        await expect(expireStaleSebRecommendations(now)).resolves.toBe(214);
        expect(mocks.info).toHaveBeenCalledWith(expect.objectContaining({ dismissed: 214 }), expect.any(String));
    });

    it('stays quiet when there is nothing to dismiss', async () => {
        await expect(expireStaleSebRecommendations(now)).resolves.toBe(0);
        expect(mocks.info).not.toHaveBeenCalled();
    });
});

type Scope = { category?: string; platform?: string | null; socialAccountId?: string | null };
const liveRow = (id: string, title: string, scope: Scope = {}) => ({
    id, title, category: 'VIDEO', platform: null, socialAccountId: null, ...scope,
});
const advice = (data: string, title: string, opts: Scope & { supersedesId?: string | null } = {}) => ({
    data,
    supersedesId: opts.supersedesId ?? null,
    match: { title, category: opts.category ?? 'VIDEO', platform: opts.platform ?? null, socialAccountId: opts.socialAccountId ?? null },
});
const rewritten = (plan: ReturnType<typeof planSebRecommendationWrites<string>>) =>
    plan.supersede.map(({ id, candidate }) => [id, candidate.data]);

describe('planSebRecommendationWrites', () => {
    it('creates everything while the board is empty', () => {
        const plan = planSebRecommendationWrites<string>([advice('a', 'Post more Reels'), advice('b', 'Pin your best performer')], []);
        expect(plan.create.map((item) => item.data)).toEqual(['a', 'b']);
        expect(plan.supersede).toEqual([]);
    });

    it('rewrites the live row instead of adding a second card for the same advice', () => {
        const plan = planSebRecommendationWrites<string>([advice('a', 'post more REELS!')], [liveRow('rec-1', 'Post more Reels')]);
        expect(plan.create).toEqual([]);
        expect(rewritten(plan)).toEqual([['rec-1', 'a']]);
    });

    it('treats account, platform and workspace scope as different advice under one title', () => {
        const plan = planSebRecommendationWrites<string>(
            [advice('account', 'Post more Reels', { socialAccountId: 'acct-b' }), advice('platform', 'Post more Reels', { platform: 'TIKTOK' })],
            [liveRow('rec-1', 'Post more Reels', { socialAccountId: 'acct-a' }), liveRow('rec-2', 'Post more Reels', { platform: 'INSTAGRAM' })],
        );
        expect(plan.supersede).toEqual([]);
        expect(plan.create.map((item) => item.data)).toEqual(['account', 'platform']);
    });

    it('follows the id Seb names when the advice is reworded', () => {
        const plan = planSebRecommendationWrites<string>(
            [advice('a', 'Win the first second with the payoff visible', { supersedesId: 'rec-9' })],
            [liveRow('rec-9', 'Strengthen the opening of every Reel')],
        );
        expect(plan.supersede.map(({ id }) => id)).toEqual(['rec-9']);
    });

    it('falls back to the title when the named id is no longer live', () => {
        const plan = planSebRecommendationWrites<string>([advice('a', 'Post more Reels', { supersedesId: 'rec-dismissed' })], [liveRow('rec-1', 'Post more Reels')]);
        expect(rewritten(plan)).toEqual([['rec-1', 'a']]);
    });

    it('never drops advice, so a second match on one row becomes a new item', () => {
        const plan = planSebRecommendationWrites<string>([advice('first', 'Post more Reels'), advice('second', 'Post more Reels')], [liveRow('rec-1', 'Post more Reels')]);
        expect(rewritten(plan)).toEqual([['rec-1', 'first']]);
        expect(plan.create.map((item) => item.data)).toEqual(['second']);
    });

    it('leaves live advice this report did not raise alone', () => {
        const plan = planSebRecommendationWrites<string>([advice('a', 'Post more Reels')], [liveRow('rec-1', 'Post more Reels'), liveRow('rec-2', 'Ask a question in the first line')]);
        expect(plan.supersede.map(({ id }) => id)).toEqual(['rec-1']);
    });

    it('separates same-titled advice by category despite folded wording', () => {
        const video = { title: 'Post more Reels', category: 'VIDEO', platform: null, socialAccountId: null };
        const strategy = { title: 'Post more Reels!', category: 'CONTENT_STRATEGY', platform: null, socialAccountId: null };
        expect(sebRecommendationKey(video)).not.toEqual(sebRecommendationKey(strategy));
    });
});
