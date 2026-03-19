/**
 * Tests for compose-actions.ts — buildPostPayload()
 * Why: This is the central payload builder for the compose→schedule→publish flow.
 * Any field mapping error here silently drops data (e.g., product tags, TikTok settings).
 */

import { describe, it, expect } from 'vitest';
import { buildPostPayload } from '@/lib/compose-actions';
import { type AccountSettings } from '@/hooks/use-compose';

/** Helper: build a minimal AccountSettings for a given platform */
function makeSettings(overrides: Partial<AccountSettings> = {}): AccountSettings {
    return {
        accountId: 'acc-1',
        postType: 'feed',
        callToAction: '',
        captionOverride: '',
        firstCommentOverride: '',
        mediaOverride: undefined,
        pinTitle: '',
        pinLink: '',
        boardId: '',
        location: '',
        videoTitle: '',
        category: '',
        playlist: '',
        videoTags: [],
        createFirstLike: false,
        embeddable: true,
        notifySubscribers: true,
        madeForKids: false,
        privacy: 'public',
        commentsEnabled: true,
        tiktokPrivacyLevel: 'PUBLIC_TO_EVERYONE',
        tiktokContentDisclosure: false,
        tiktokBrandOrganicToggle: false,
        tiktokBrandContentToggle: false,
        tiktokIsAigc: false,
        tiktokCommentsEnabled: true,
        tiktokDuetsEnabled: true,
        tiktokStitchesEnabled: true,
        instagramShareToFeed: false,
        instagramComments: true,
        linkedinVisibility: 'PUBLIC',
        autoPublish: true,
        notifyDeviceIds: [],
        productTags: [],
        ...overrides,
    } as AccountSettings;
}

describe('buildPostPayload', () => {
    it('builds a basic payload with one account and default settings', () => {
        const result = buildPostPayload({
            caption: 'Hello world',
            selectedAccountIds: ['acc-1'],
            media: [{ id: 'media-1', url: '/test.jpg', type: 'image', size: 1024 }],
            firstComment: '',
            effectiveAccountSettings: {
                'acc-1': makeSettings(),
            },
        });

        expect(result.caption).toBe('Hello world');
        expect(result.platformAccountIds).toEqual(['acc-1']);
        expect(result.mediaIds).toEqual(['media-1']);
        expect(result.platformSettings['acc-1'].postType).toBe('feed');
    });

    it('maps TikTok content disclosure fields correctly', () => {
        const result = buildPostPayload({
            caption: 'TikTok post',
            selectedAccountIds: ['acc-tt'],
            media: [{ id: 'vid-1', url: '/test.mp4', type: 'video', size: 5000 }],
            firstComment: '',
            effectiveAccountSettings: {
                'acc-tt': makeSettings({
                    accountId: 'acc-tt',
                    tiktokContentDisclosure: true,
                    tiktokBrandOrganicToggle: true,
                    tiktokBrandContentToggle: false,
                }),
            },
        });

        const ttSettings = result.platformSettings['acc-tt'];
        expect(ttSettings.tiktokContentDisclosure).toBe(true);
        expect(ttSettings.tiktokBrandOrganic).toBe(true);
        expect(ttSettings.tiktokBrandContent).toBe(false);
    });

    it('sends undefined mediaIds when media array is empty to prevent server-side deletion', () => {
        const result = buildPostPayload({
            caption: 'No media',
            selectedAccountIds: ['acc-1'],
            media: [],
            firstComment: '',
            effectiveAccountSettings: {
                'acc-1': makeSettings(),
            },
        });

        expect(result.mediaIds).toBeUndefined();
    });

    it('serializes product tags with correct field names', () => {
        const result = buildPostPayload({
            caption: 'Shop post',
            selectedAccountIds: ['acc-1'],
            media: [{ id: 'img-1', url: '/product.jpg', type: 'image', size: 2048 }],
            firstComment: '',
            effectiveAccountSettings: {
                'acc-1': makeSettings({
                    productTags: [{
                        id: 'tag-1',
                        platformProductId: 'prod-123',
                        product: { name: 'Test Product' } as never,
                        mediaIndex: 0,
                        positionX: 0.5,
                        positionY: 0.3,
                    }],
                }),
            },
        });

        const tags = result.platformSettings['acc-1'].productTags;
        expect(tags).toHaveLength(1);
        expect(tags![0]).toEqual({
            platformProductId: 'prod-123',
            productName: 'Test Product',
            mediaIndex: 0,
            positionX: 0.5,
            positionY: 0.3,
        });
    });

    it('respects resizedMediaMap for per-account media IDs', () => {
        const result = buildPostPayload({
            caption: 'Resized post',
            selectedAccountIds: ['acc-1', 'acc-2'],
            media: [{ id: 'orig-1', url: '/orig.jpg', type: 'image', size: 4096 }],
            firstComment: '',
            effectiveAccountSettings: {
                'acc-1': makeSettings({ accountId: 'acc-1' }),
                'acc-2': makeSettings({ accountId: 'acc-2' }),
            },
            resizedMediaMap: {
                'acc-1': [{ id: 'resized-1', url: '/resized.jpg', type: 'image', size: 2048 }],
            },
        });

        // acc-1 should get the resized media ID
        expect(result.platformSettings['acc-1'].mediaIds).toEqual(['resized-1']);
        // acc-2 has no resized media, so mediaIds should be undefined (falls through)
        expect(result.platformSettings['acc-2'].mediaIds).toBeUndefined();
    });

    it('forwards scheduledAt and autoPublish when provided', () => {
        const result = buildPostPayload({
            caption: 'Scheduled post',
            selectedAccountIds: ['acc-1'],
            media: [],
            firstComment: 'First!',
            effectiveAccountSettings: {
                'acc-1': makeSettings(),
            },
            scheduledAt: '2026-03-20T10:00:00.000Z',
            autoPublish: true,
        });

        expect(result.scheduledAt).toBe('2026-03-20T10:00:00.000Z');
        expect(result.autoPublish).toBe(true);
        expect(result.firstComment).toBe('First!');
    });

    it('handles multiple accounts with different platform settings', () => {
        const result = buildPostPayload({
            caption: 'Multi-platform',
            selectedAccountIds: ['acc-ig', 'acc-pin'],
            media: [{ id: 'img-1', url: '/photo.jpg', type: 'image', size: 1024 }],
            firstComment: '',
            effectiveAccountSettings: {
                'acc-ig': makeSettings({ accountId: 'acc-ig', postType: 'reel', instagramShareToFeed: true }),
                'acc-pin': makeSettings({ accountId: 'acc-pin', postType: 'feed', pinTitle: 'My Pin', boardId: 'board-123' }),
            },
        });

        expect(result.platformSettings['acc-ig'].postType).toBe('reel');
        expect(result.platformSettings['acc-ig'].instagramShareToFeed).toBe(true);
        expect(result.platformSettings['acc-pin'].pinTitle).toBe('My Pin');
        expect(result.platformSettings['acc-pin'].boardId).toBe('board-123');
    });
});
