import { describe, expect, it } from 'vitest';
import { validatePost } from '../validation';
import { validateMediaItem } from '../validation/media-validation';
import type { MediaInfo } from '../validation/types';

const MB = 1024 * 1024;

it.each([
    ['instagram', 'carousel'],
    ['instagram', 'story'],
    ['facebook', 'story'],
])('retains the smaller %s %s size limit', (platform, postType) => {
    const issues = validateMediaItem({
        id: 'video', type: 'video', mimeType: 'video/mp4',
        width: 1080, height: 1920, duration: 10, size: 250 * MB,
    }, [platform], { [platform]: postType });
    expect(issues).toContainEqual(expect.objectContaining({
        severity: 'error', fixType: 'size',
        message: expect.stringContaining('max: 100MB'),
    }));
});

describe.each([
    { platform: 'instagram', postType: 'feed', rule: 'video-instagram', maxMB: 1024 },
    { platform: 'instagram', postType: 'reel', rule: 'video-instagram-reel', maxMB: 1024 },
    { platform: 'facebook', postType: 'reel', rule: 'video-facebook-reel', maxMB: 1024 },
    { platform: 'tiktok', postType: 'video', rule: 'video-tiktok', maxMB: 4096 },
    { platform: 'tiktok', postType: 'post', rule: 'video-tiktok', maxMB: 4096 },
    { platform: 'youtube', postType: 'short', rule: 'video-youtube-short', maxMB: 256 * 1024 },
])('$platform $postType size validation', ({ platform, postType, rule, maxMB }) => {
    function validate(size: number) {
        const media: MediaInfo = {
            id: 'video', type: 'video', mimeType: 'video/mp4', format: 'mp4',
            width: 1080, height: postType === 'feed' ? 1080 : 1920,
            duration: 30, size,
        };
        const postTypes = { [platform]: postType };
        return {
            inline: validateMediaItem(media, [platform], postTypes),
            publishing: validatePost({
                caption: 'Test video', hashtags: [], mentions: [],
                platforms: [platform], postTypes, media: [media],
            }).get(rule),
        };
    }

    it.each([250, 500, maxMB])('accepts %i MB in both validators', (sizeMB) => {
        const result = validate(sizeMB * MB);
        expect(result.inline.filter(issue => issue.fixType === 'size')).toEqual([]);
        expect(result.publishing?.status).toBe('pass');
    });

    it('rejects one byte over the platform limit in both validators', () => {
        const result = validate(maxMB * MB + 1);
        expect(result.inline).toContainEqual(expect.objectContaining({
            severity: 'error', fixType: 'size',
            message: expect.stringContaining(`max: ${maxMB}MB`),
        }));
        expect(result.publishing).toMatchObject({
            status: 'error', message: expect.stringContaining(`max: ${maxMB}MB`),
        });
    });
});
