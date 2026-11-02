import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Live Seb advice that goes untouched for this many days is auto-dismissed.
 * Why: every report creates up to 20 recommendations and nothing retired them, so
 * a workspace on the daily review cadence piles up hundreds of unanswered
 * suggestions and the current advice drowns in months of stale ones.
 */
export const SEB_RECOMMENDATION_TTL_DAYS = 7;

/**
 * Dismisses live recommendations across every workspace once they age out.
 *
 * Age is measured from `updatedAt`: untouched advice is never written, so its last
 * update is still the moment Seb created it, while a recommendation someone moved
 * to IN_PROGRESS gets a fresh window from the point they started acting on it.
 * Rows are claimed by status in the same statement, so advice reopened or
 * completed while the sweep runs is never overwritten, and a redelivered sweep
 * cannot dismiss anything twice.
 *
 * @returns the number of recommendations dismissed
 */
export async function expireStaleSebRecommendations(now = new Date(), ttlDays = SEB_RECOMMENDATION_TTL_DAYS): Promise<number> {
    const cutoff = new Date(now.getTime() - ttlDays * 24 * 60 * 60 * 1000);
    const { count } = await db.sebRecommendation.updateMany({
        where: { status: { in: ['NEW', 'IN_PROGRESS'] }, updatedAt: { lt: cutoff } },
        data: { status: 'DISMISSED' },
    });
    if (count) logger.info({ dismissed: count, cutoff }, 'Expired stale Seb recommendations');
    return count;
}

/** Advice still on the board. The sweep above bounds it to roughly a week of reports. */
export type LiveSebRecommendation = {
    id: string;
    title: string;
    category: string;
    platform: string | null;
    socialAccountId: string | null;
};

/**
 * One item of a report's advice, carrying whatever the caller needs to write it
 * plus how it identifies itself: the live recommendation Seb says it replaces, and
 * the title and scope it came back with.
 */
export type SebAdviceCandidate<T> = {
    data: T;
    supersedesId?: string | null;
    match: Omit<LiveSebRecommendation, 'id'>;
};

/**
 * Identity of a piece of advice: what it says, and who it is for. Titles are folded
 * rather than fuzzy-matched so "Post more Reels!" and "post more reels" agree
 * without a similarity threshold quietly merging different advice. Account scope
 * outranks platform scope, and neither is the same advice as advice for the whole
 * workspace.
 */
export function sebRecommendationKey({ title, category, platform, socialAccountId }: Omit<LiveSebRecommendation, 'id'>): string {
    const scope = socialAccountId || platform || 'workspace';
    const folded = title.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
    return `${category}|${scope}|${folded}`;
}

/**
 * Splits a report's advice into items to create and live rows to rewrite in place,
 * so repeating advice a workspace already has does not get a second card.
 *
 * Seb's own `supersedesId` decides first, since only the model can tell a reworded
 * repeat from a new idea; the title-and-scope key is the deterministic fallback when
 * that id is absent or names a recommendation that is no longer live. Nothing is
 * dropped: unmatched advice is created, and live rows this report did not raise are
 * left for the expiry sweep to retire. When two items match one row, the first
 * rewrites it and the second is created — the pair then ages out together.
 */
export function planSebRecommendationWrites<T>(candidates: SebAdviceCandidate<T>[], live: LiveSebRecommendation[]): {
    create: SebAdviceCandidate<T>[];
    supersede: { id: string; candidate: SebAdviceCandidate<T> }[];
} {
    const byId = new Map(live.map((item) => [item.id, item]));
    const byKey = new Map(live.map((item) => [sebRecommendationKey(item), item]));
    const claimed = new Set<string>();
    const create: SebAdviceCandidate<T>[] = [];
    const supersede: { id: string; candidate: SebAdviceCandidate<T> }[] = [];

    for (const candidate of candidates) {
        const named = candidate.supersedesId && byId.has(candidate.supersedesId) ? byId.get(candidate.supersedesId) : undefined;
        const target = named && !claimed.has(named.id) ? named : byKey.get(sebRecommendationKey(candidate.match));
        if (target && !claimed.has(target.id)) {
            claimed.add(target.id);
            supersede.push({ id: target.id, candidate });
        } else {
            create.push(candidate);
        }
    }

    return { create, supersede };
}
