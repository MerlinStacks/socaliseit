import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getFacebookPageReviews } from '@/lib/platform-api/facebook-api';
import { getGoogleReviews } from '@/lib/platform-api/google-business-reviews';
import { metaJson } from '@/lib/platform-api/meta-fetch';

vi.mock('@/lib/logger', () => ({
    logger: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    },
}));

vi.mock('@/lib/platform-api/meta-fetch', () => ({
    metaFetch: vi.fn(),
    metaJson: vi.fn(),
}));

function googleReview(reviewId: string) {
    return {
        name: `reviews/${reviewId}`,
        reviewId,
        reviewer: { displayName: `Reviewer ${reviewId}` },
        starRating: 'FIVE',
        createTime: '2026-01-01T00:00:00.000Z',
        updateTime: '2026-01-01T00:00:00.000Z',
    };
}

describe('review API pagination', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('fetches every Google review page before marking the result complete', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    reviews: [googleReview('one')],
                    totalReviewCount: 2,
                    nextPageToken: 'second-page',
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ reviews: [googleReview('two')], totalReviewCount: 2 }),
            });

        const result = await getGoogleReviews('token', 'account_location');

        expect(result).toMatchObject({ success: true, complete: true, totalCount: 2 });
        expect(result.reviews.map((review) => review.platformReviewId)).toEqual(['one', 'two']);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[1][0]).toContain('pageToken=second-page');
    });

    it('does not mark a partial Google result complete when a later page fails', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    reviews: [googleReview('one')],
                    totalReviewCount: 2,
                    nextPageToken: 'second-page',
                }),
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: () => Promise.resolve({ error: { message: 'page failed' } }),
            });

        const result = await getGoogleReviews('token', 'account_location');

        expect(result).toMatchObject({ success: false, complete: false, reviews: [] });
    });

    it('follows Facebook paging and requests recommendation_type', async () => {
        vi.mocked(metaJson)
            .mockResolvedValueOnce({
                data: [{
                    reviewer: { id: 'user-1', name: 'First' },
                    recommendation_type: 'positive',
                    created_time: '2026-01-01T00:00:00.000Z',
                    open_graph_story: { id: 'review-1' },
                }],
                paging: { next: 'https://graph.facebook.com/next-page' },
            })
            .mockResolvedValueOnce({
                data: [{
                    reviewer: { id: 'user-2', name: 'Second' },
                    recommendation_type: 'negative',
                    created_time: '2026-01-02T00:00:00.000Z',
                    open_graph_story: { id: 'review-2' },
                }],
            });

        const result = await getFacebookPageReviews('token', 'page-id');

        expect(result).toMatchObject({ success: true, complete: true });
        expect(result.data?.map((review) => review.rating)).toEqual([5, 1]);
        expect(metaJson).toHaveBeenCalledTimes(2);
        expect(vi.mocked(metaJson).mock.calls[0][1]).toContain('recommendation_type');
        expect(vi.mocked(metaJson).mock.calls[1][1]).toBe('https://graph.facebook.com/next-page');
    });
});
