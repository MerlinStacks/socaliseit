import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/lib/db';
import { getGoogleReviews } from '@/lib/platform-api/google-business-reviews';
import { syncWorkspaceReviews } from '@/lib/services/review-sync-service';
import { sendInboxNotifications } from '@/lib/services/inbox-notifications';

vi.mock('@/lib/db', () => ({
    db: {
        socialAccount: { findMany: vi.fn() },
        review: {
            findMany: vi.fn(),
            upsert: vi.fn(),
            deleteMany: vi.fn(),
        },
    },
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    },
}));

vi.mock('@/lib/platform-api/google-business-reviews', () => ({
    getGoogleReviews: vi.fn(),
}));

vi.mock('@/lib/platform-api/facebook-api', () => ({
    getFacebookPageReviews: vi.fn(),
}));

vi.mock('@/lib/services/token-service', () => ({
    withTokenRefreshRetry: vi.fn((_accountId: string, operation: (token: string) => unknown) => operation('token')),
}));

vi.mock('@/lib/services/inbox-notifications', () => ({
    sendInboxNotifications: vi.fn(),
}));

const account = {
    id: 'account-1',
    organizationId: 'org-1',
    platform: 'GOOGLE_BUSINESS' as const,
    platformId: 'google-account_location',
    accessToken: 'encrypted',
};

function review(platformReviewId: string, text: string | null) {
    return {
        platformReviewId,
        authorName: 'Reviewer',
        authorAvatar: null,
        rating: 5,
        text,
        replyText: null,
        isReplied: false,
        reviewUrl: null,
        createdAt: '2026-01-01T00:00:00.000Z',
    };
}

describe('syncWorkspaceReviews', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(db.socialAccount.findMany).mockResolvedValue([account] as never);
        vi.mocked(db.review.upsert).mockResolvedValue({} as never);
        vi.mocked(db.review.deleteMany).mockResolvedValue({ count: 0 });
    });

    it('counts only genuinely new and changed reviews and keeps prune tenant-scoped', async () => {
        vi.mocked(getGoogleReviews).mockResolvedValue({
            success: true,
            complete: true,
            reviews: [review('unchanged', 'same'), review('changed', 'new text'), review('new', 'new')],
            totalCount: 3,
        });
        vi.mocked(db.review.findMany).mockResolvedValue([
            review('unchanged', 'same'),
            review('changed', 'old text'),
        ] as never);

        const result = await syncWorkspaceReviews('org-1');

        expect(result).toMatchObject({ reviewsAdded: 1, reviewsUpdated: 1 });
        expect(sendInboxNotifications).toHaveBeenCalledWith(expect.objectContaining({
            organizationId: 'org-1',
            reviewsAdded: 1,
        }));
        expect(db.review.deleteMany).toHaveBeenCalledWith({
            where: {
                organizationId: 'org-1',
                socialAccountId: 'account-1',
                platform: 'GOOGLE_BUSINESS',
                platformReviewId: { notIn: ['unchanged', 'changed', 'new'] },
            },
        });
    });

    it('does not prune when an upstream result is not complete', async () => {
        vi.mocked(getGoogleReviews).mockResolvedValue({
            success: true,
            complete: false,
            reviews: [review('only-first-page', 'partial')],
            totalCount: 2,
        });
        vi.mocked(db.review.findMany).mockResolvedValue([]);

        await syncWorkspaceReviews('org-1');

        expect(db.review.deleteMany).not.toHaveBeenCalled();
    });

    it('prunes all account reviews when a complete upstream set is empty', async () => {
        vi.mocked(getGoogleReviews).mockResolvedValue({
            success: true,
            complete: true,
            reviews: [],
            totalCount: 0,
        });
        vi.mocked(db.review.findMany).mockResolvedValue([]);

        await syncWorkspaceReviews('org-1');

        expect(db.review.deleteMany).toHaveBeenCalledWith({
            where: {
                organizationId: 'org-1',
                socialAccountId: 'account-1',
                platform: 'GOOGLE_BUSINESS',
            },
        });
    });
});
