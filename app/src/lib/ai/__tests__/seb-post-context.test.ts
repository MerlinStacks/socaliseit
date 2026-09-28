import { describe, expect, it } from 'vitest';
import { deduplicateSebPosts } from '../seb-post-context';

const native = {
    id: 'native', status: 'PUBLISHED', platform: 'FACEBOOK', socialAccountId: 'page',
    postType: 'FEED', platformPostId: 'page_post', externalId: null, isExternal: false,
    caption: 'Same caption',
};
const imported = { ...native, id: 'imported', platformPostId: null, externalId: 'page_post', isExternal: true };

describe('Seb publication context', () => {
    it('represents an app post and its imported copy once, preferring the native record in either order', () => {
        expect(deduplicateSebPosts([imported, native])).toEqual([native]);
        expect(deduplicateSebPosts([native, imported])).toEqual([native]);
    });

    it('keeps genuinely distinct publications even with identical captions', () => {
        const second = { ...native, id: 'second', platformPostId: 'page_other' };
        expect(deduplicateSebPosts([native, second])).toEqual([native, second]);
    });

    it('keeps separate accounts, platforms, formats, and unpublished records', () => {
        const posts = [native,
            { ...imported, id: 'other-account', socialAccountId: 'other-page' },
            { ...imported, id: 'other-platform', platform: 'INSTAGRAM' },
            { ...imported, id: 'story', postType: 'STORY' },
            { ...imported, id: 'scheduled', status: 'SCHEDULED' },
        ];
        expect(deduplicateSebPosts(posts)).toEqual(posts);
    });

    it('does not guess identity when platform IDs or account scope are missing', () => {
        const posts = [
            { ...native, id: 'unknown-one', platformPostId: null },
            { ...native, id: 'unknown-two', platformPostId: null },
            { ...native, id: 'unscoped-one', socialAccountId: null },
            { ...native, id: 'unscoped-two', socialAccountId: null },
        ];
        expect(deduplicateSebPosts(posts)).toEqual(posts);
    });
});
