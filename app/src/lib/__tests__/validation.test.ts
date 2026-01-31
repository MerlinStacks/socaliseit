/**
 * Validation Engine Unit Tests
 * Tests for the pre-publish validation rules
 */

import { describe, it, expect } from 'vitest';
import {
    validatePost,
    getValidationSummary,
    PLATFORM_LIMITS,
    BANNED_HASHTAGS,
    getCharacterStatus,
    getHashtagStatus,
    getMediaAspectStatus,
    type ValidationContext,
    type MediaInfo,
} from '../validation';

describe('validatePost', () => {
    const createContext = (overrides: Partial<ValidationContext> = {}): ValidationContext => ({
        caption: 'Test caption',
        hashtags: [],
        mentions: [],
        media: [],
        platforms: ['instagram'],
        ...overrides,
    });

    describe('Instagram Caption Validation', () => {
        it('should pass for caption within limit', () => {
            const ctx = createContext({ caption: 'Short caption' });
            const results = validatePost(ctx);
            const captionRule = results.get('caption-length-instagram');

            expect(captionRule).toBeDefined();
            expect(captionRule?.status).toBe('pass');
        });

        it('should warn for caption exceeding recommended length', () => {
            const longCaption = 'a'.repeat(PLATFORM_LIMITS.instagram.caption.recommended + 10);
            const ctx = createContext({ caption: longCaption });
            const results = validatePost(ctx);
            const captionRule = results.get('caption-length-instagram');

            expect(captionRule?.status).toBe('warning');
        });

        it('should error for caption exceeding max length', () => {
            const tooLongCaption = 'a'.repeat(PLATFORM_LIMITS.instagram.caption.max + 100);
            const ctx = createContext({ caption: tooLongCaption });
            const results = validatePost(ctx);
            const captionRule = results.get('caption-length-instagram');

            expect(captionRule?.status).toBe('error');
            expect(captionRule?.canAutoFix).toBe(true);
        });
    });

    describe('Instagram Hashtag Validation', () => {
        it('should pass for hashtag count within limit', () => {
            const ctx = createContext({
                hashtags: ['#tag1', '#tag2', '#tag3'],
            });
            const results = validatePost(ctx);
            const hashtagRule = results.get('hashtag-count-instagram');

            expect(hashtagRule?.status).toBe('pass');
        });

        it('should error for too many hashtags', () => {
            const tooManyHashtags = Array.from(
                { length: PLATFORM_LIMITS.instagram.hashtags.max + 5 },
                (_, i) => `#tag${i}`
            );
            const ctx = createContext({ hashtags: tooManyHashtags });
            const results = validatePost(ctx);
            const hashtagRule = results.get('hashtag-count-instagram');

            expect(hashtagRule?.status).toBe('error');
            expect(hashtagRule?.canAutoFix).toBe(true);
        });
    });

    describe('Banned Hashtag Detection', () => {
        it('should pass when no banned hashtags present', () => {
            const ctx = createContext({
                hashtags: ['#fashion', '#style', '#ootd'],
            });
            const results = validatePost(ctx);
            const bannedRule = results.get('banned-hashtags');

            expect(bannedRule?.status).toBe('pass');
        });

        it('should error when banned hashtags are present', () => {
            const ctx = createContext({
                hashtags: ['#fashion', '#followforfollow', '#style'],
            });
            const results = validatePost(ctx);
            const bannedRule = results.get('banned-hashtags');

            expect(bannedRule?.status).toBe('error');
            expect(bannedRule?.message).toContain('followforfollow');
            expect(bannedRule?.canAutoFix).toBe(true);
        });

        it('should detect case-insensitive banned hashtags', () => {
            const ctx = createContext({
                hashtags: ['#FOLLOWFORFOLLOW', '#F4F'],
            });
            const results = validatePost(ctx);
            const bannedRule = results.get('banned-hashtags');

            expect(bannedRule?.status).toBe('error');
        });
    });

    describe('Image Validation', () => {
        const createImage = (overrides: Partial<MediaInfo> = {}): MediaInfo => ({
            id: 'img-1',
            type: 'image',
            width: 1080,
            height: 1080,
            size: 1024 * 1024,
            mimeType: 'image/jpeg',
            ...overrides,
        });

        it('should pass for optimal square image', () => {
            const ctx = createContext({
                media: [createImage({ width: 1080, height: 1080 })],
            });
            const results = validatePost(ctx);
            const aspectRule = results.get('image-aspect-instagram');

            expect(aspectRule?.status).toBe('pass');
        });

        it('should warn for non-standard aspect ratio', () => {
            const ctx = createContext({
                media: [createImage({ width: 1000, height: 600 })], // Unusual ratio
            });
            const results = validatePost(ctx);
            const aspectRule = results.get('image-aspect-instagram');

            expect(aspectRule?.status).toBe('warning');
        });

        it('should error for image below minimum resolution', () => {
            const ctx = createContext({
                media: [createImage({ width: 200, height: 200 })],
            });
            const results = validatePost(ctx);
            const resRule = results.get('image-resolution-instagram');

            expect(resRule?.status).toBe('error');
        });
    });

    describe('Video Validation', () => {
        const createVideo = (overrides: Partial<MediaInfo> = {}): MediaInfo => ({
            id: 'vid-1',
            type: 'video',
            width: 1080,
            height: 1920,
            size: 10 * 1024 * 1024,
            duration: 30,
            mimeType: 'video/mp4',
            ...overrides,
        });

        it('should pass for TikTok video within duration limits', () => {
            const ctx = createContext({
                platforms: ['tiktok'],
                media: [createVideo({ duration: 60 })],
            });
            const results = validatePost(ctx);
            const durationRule = results.get('video-duration-tiktok');

            expect(durationRule?.status).toBe('pass');
        });

        it('should error for TikTok video too short', () => {
            const ctx = createContext({
                platforms: ['tiktok'],
                media: [createVideo({ duration: 0.5 })],
            });
            const results = validatePost(ctx);
            const durationRule = results.get('video-duration-tiktok');

            expect(durationRule?.status).toBe('error');
        });

        it('should error for TikTok video too long', () => {
            const ctx = createContext({
                platforms: ['tiktok'],
                media: [createVideo({ duration: 700 })], // > 10 minutes
            });
            const results = validatePost(ctx);
            const durationRule = results.get('video-duration-tiktok');

            expect(durationRule?.status).toBe('error');
        });
    });

    describe('LinkedIn Validation', () => {
        it('should error for too many LinkedIn hashtags', () => {
            const ctx = createContext({
                platforms: ['linkedin'],
                hashtags: ['#tag1', '#tag2', '#tag3', '#tag4', '#tag5', '#tag6', '#tag7'],
            });
            const results = validatePost(ctx);
            const hashtagRule = results.get('hashtag-count-linkedin');

            expect(hashtagRule?.status).toBe('error');
        });
    });

    describe('Bluesky Validation', () => {
        it('should error for caption exceeding Bluesky limit', () => {
            const longCaption = 'a'.repeat(350); // > 300
            const ctx = createContext({
                platforms: ['bluesky'],
                caption: longCaption,
            });
            const results = validatePost(ctx);
            const captionRule = results.get('caption-length-bluesky');

            expect(captionRule?.status).toBe('error');
        });

        it('should error for too many Bluesky images', () => {
            const images: MediaInfo[] = Array.from({ length: 5 }, (_, i) => ({
                id: `img-${i}`,
                type: 'image',
                width: 1080,
                height: 1080,
                size: 500000,
                mimeType: 'image/jpeg',
            }));
            const ctx = createContext({
                platforms: ['bluesky'],
                media: images,
            });
            const results = validatePost(ctx);
            const imageRule = results.get('image-count-bluesky');

            expect(imageRule?.status).toBe('error');
        });
    });

    describe('Platform Filtering', () => {
        it('should not run Instagram rules for TikTok-only posts', () => {
            const ctx = createContext({
                platforms: ['tiktok'],
                caption: 'a'.repeat(2500), // Would fail Instagram limit
            });
            const results = validatePost(ctx);

            // Instagram caption rule should not be present
            expect(results.has('caption-length-instagram')).toBe(false);
            // TikTok rules should be present
            expect(results.has('video-duration-tiktok')).toBe(true);
        });

        it('should run "all" platform rules for any platform', () => {
            const ctx = createContext({
                platforms: ['pinterest'],
                hashtags: ['#followforfollow'],
            });
            const results = validatePost(ctx);

            // Banned hashtag rule applies to all platforms
            expect(results.get('banned-hashtags')?.status).toBe('error');
        });
    });
});

describe('getValidationSummary', () => {
    it('should correctly count errors, warnings, and passes', () => {
        const results = new Map([
            ['rule1', { status: 'pass' as const, message: 'ok' }],
            ['rule2', { status: 'pass' as const, message: 'ok' }],
            ['rule3', { status: 'warning' as const, message: 'warn' }],
            ['rule4', { status: 'error' as const, message: 'fail' }],
        ]);

        const summary = getValidationSummary(results);

        expect(summary.passed).toBe(2);
        expect(summary.warnings).toBe(1);
        expect(summary.errors).toBe(1);
        expect(summary.canPublish).toBe(false);
    });

    it('should allow publishing when no errors', () => {
        const results = new Map([
            ['rule1', { status: 'pass' as const, message: 'ok' }],
            ['rule2', { status: 'warning' as const, message: 'warn' }],
        ]);

        const summary = getValidationSummary(results);

        expect(summary.canPublish).toBe(true);
    });
});

describe('PLATFORM_LIMITS', () => {
    it('should have reasonable Instagram limits', () => {
        expect(PLATFORM_LIMITS.instagram.caption.max).toBe(2200);
        expect(PLATFORM_LIMITS.instagram.hashtags.max).toBe(30);
    });

    it('should have reasonable Bluesky limits', () => {
        expect(PLATFORM_LIMITS.bluesky.caption.max).toBe(300);
        expect(PLATFORM_LIMITS.bluesky.image.maxFiles).toBe(4);
    });
});

describe('BANNED_HASHTAGS', () => {
    it('should contain common spam hashtags', () => {
        expect(BANNED_HASHTAGS.has('followforfollow')).toBe(true);
        expect(BANNED_HASHTAGS.has('f4f')).toBe(true);
        expect(BANNED_HASHTAGS.has('like4like')).toBe(true);
    });

    it('should not contain legitimate hashtags', () => {
        expect(BANNED_HASHTAGS.has('fashion')).toBe(false);
        expect(BANNED_HASHTAGS.has('travel')).toBe(false);
    });
});

// ============================================================================
// Inline Validation Helper Tests
// ============================================================================

describe('getCharacterStatus', () => {
    it('should return ok status for short text', () => {
        const result = getCharacterStatus('Hello world', 'instagram');
        expect(result.status).toBe('ok');
        expect(result.count).toBe(11);
        expect(result.limit).toBe(2200);
        expect(result.remaining).toBe(2189);
    });

    it('should return warning when over 80% of limit', () => {
        const text = 'a'.repeat(1800); // ~82% of 2200
        const result = getCharacterStatus(text, 'instagram');
        expect(result.status).toBe('warning');
    });

    it('should return error when over limit', () => {
        const text = 'a'.repeat(2300);
        const result = getCharacterStatus(text, 'instagram');
        expect(result.status).toBe('error');
        expect(result.remaining).toBe(-100);
    });

    it('should handle Twitter 280 limit', () => {
        const text = 'a'.repeat(300);
        const result = getCharacterStatus(text, 'twitter');
        expect(result.status).toBe('error');
        expect(result.limit).toBe(280);
    });

    it('should handle Bluesky 300 limit', () => {
        const text = 'a'.repeat(250);
        const result = getCharacterStatus(text, 'bluesky');
        expect(result.status).toBe('warning'); // 83% of 300
        expect(result.limit).toBe(300);
    });
});

describe('getHashtagStatus', () => {
    it('should return ok for few hashtags', () => {
        const result = getHashtagStatus(['#one', '#two'], 'instagram');
        expect(result.status).toBe('ok');
        expect(result.count).toBe(2);
        expect(result.limit).toBe(30);
    });

    it('should return warning when over recommended', () => {
        const tags = Array.from({ length: 10 }, (_, i) => `#tag${i}`);
        const result = getHashtagStatus(tags, 'instagram');
        expect(result.status).toBe('warning');
        expect(result.message).toContain('recommended');
    });

    it('should return error when over limit', () => {
        const tags = Array.from({ length: 35 }, (_, i) => `#tag${i}`);
        const result = getHashtagStatus(tags, 'instagram');
        expect(result.status).toBe('error');
        expect(result.message).toContain('Max 30');
    });

    it('should handle LinkedIn strict limit', () => {
        const tags = Array.from({ length: 6 }, (_, i) => `#tag${i}`);
        const result = getHashtagStatus(tags, 'linkedin');
        expect(result.status).toBe('error');
        expect(result.limit).toBe(5);
    });
});

describe('getMediaAspectStatus', () => {
    it('should return optimal for 1:1 square on Instagram', () => {
        const result = getMediaAspectStatus(1080, 1080, 'instagram');
        expect(result.status).toBe('ok');
        expect(result.isOptimal).toBe(true);
        expect(result.ratioString).toBe('1:1');
    });

    it('should return optimal for 4:5 portrait on Instagram', () => {
        const result = getMediaAspectStatus(1080, 1350, 'instagram');
        expect(result.status).toBe('ok');
        expect(result.isOptimal).toBe(true);
    });

    it('should warn for non-standard ratio on Instagram', () => {
        const result = getMediaAspectStatus(1000, 600, 'instagram');
        expect(result.status).toBe('warning');
        expect(result.isOptimal).toBe(false);
        expect(result.message).toContain('cropped');
    });

    it('should return optimal for 9:16 on TikTok', () => {
        const result = getMediaAspectStatus(1080, 1920, 'tiktok');
        expect(result.status).toBe('ok');
        expect(result.ratioString).toBe('9:16');
    });

    it('should warn for horizontal video on TikTok', () => {
        const result = getMediaAspectStatus(1920, 1080, 'tiktok');
        expect(result.status).toBe('warning');
        expect(result.message).toContain('9:16');
    });

    it('should return optimal for 2:3 on Pinterest', () => {
        const result = getMediaAspectStatus(1000, 1500, 'pinterest');
        expect(result.status).toBe('ok');
    });
});
