import { describe, expect, it } from 'vitest';
import { getPostPermalink } from '../post-permalink';

describe('post permalink recovery', () => {
    it.each([
        ['YOUTUBE', 'abcdefghI_1', 'https://www.youtube.com/watch?v=abcdefghI_1'],
        ['PINTEREST', '989103136939325202', 'https://www.pinterest.com/pin/989103136939325202/'],
        ['FACEBOOK', '123_456', 'https://www.facebook.com/123_456'],
        ['LINKEDIN', 'urn:li:share:123', 'https://www.linkedin.com/feed/update/urn:li:share:123/'],
        ['TWITTER', '123', 'https://x.com/i/web/status/123'],
        ['INSTAGRAM', '123456', null],
        ['THREADS', '123456', null],
        ['TIKTOK', 'tiktok_pending:123', null],
        ['YOUTUBE', 'invalid', null],
        ['PINTEREST', 'undefined', null],
        ['YOUTUBE', null, null],
    ])('resolves %s ID %s safely', (platform, id, expected) => {
        expect(getPostPermalink(platform, id)).toBe(expected);
    });
});
