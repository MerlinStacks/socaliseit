import { describe, expect, it } from 'vitest';
import { SubtitleTracksSchema, UserTagsSchema, validatePublishingMetadata } from '../publishing-metadata';
import { publishingCapabilityWarnings } from '../publishing-capabilities';
import { reachReadinessRules } from '../validation/rules/reach-readiness-rules';
import type { ValidationContext } from '../validation/types';

const track = { language: 'en-AU', name: 'English', text: '1\n00:00:00,000 --> 00:00:02,000\nHello.' };
describe('publishing metadata validation', () => {
    it('accepts timed captions and rejects untimed transcripts, duplicate tracks, and invalid languages', () => {
        expect(SubtitleTracksSchema.safeParse([track]).success).toBe(true);
        expect(SubtitleTracksSchema.safeParse([{ ...track, text: 'Invented dialogue' }]).success).toBe(false);
        expect(SubtitleTracksSchema.safeParse([{ ...track, language: 'English' }]).success).toBe(false);
        expect(SubtitleTracksSchema.safeParse([track, track]).success).toBe(false);
    });
    it('validates usernames, image positions, and attachment indexes', () => {
        const tag = { username: 'person', x: 0, y: 1, mediaIndex: 0 };
        expect(UserTagsSchema.safeParse([tag]).success).toBe(true);
        expect(UserTagsSchema.safeParse([{ ...tag, username: '@person' }]).success).toBe(false);
        expect(UserTagsSchema.safeParse([{ ...tag, x: 2 }]).success).toBe(false);
        expect(validatePublishingMetadata({ userTags: [tag] }, 0)).toContain('no longer attached');
        expect(validatePublishingMetadata({ userTags: [] }, 0)).toBeNull();
        expect(validatePublishingMetadata({ productTags: [null] }, 1)).toContain('productTags');
    });
    it('explains unsupported settings rather than promising to apply them', () => {
        expect(publishingCapabilityWarnings('YOUTUBE', { youtubeCommentsEnabled: false })).toEqual([expect.stringContaining('channel defaults')]);
        expect(publishingCapabilityWarnings('FACEBOOK', { productTags: [{}], subtitleTracks: [track] })).toHaveLength(2);
        expect(publishingCapabilityWarnings('INSTAGRAM', { productTags: [{}] })).toEqual([]);
        expect(publishingCapabilityWarnings('INSTAGRAM', { postType: 'story', productTags: [{}] })).toHaveLength(1);
    });
});

describe('reach readiness is account-specific and advisory', () => {
    const check = (id: string, context: ValidationContext) => reachReadinessRules.find(rule => rule.id === id)!.check(context);
    const base: ValidationContext = { caption: '', hashtags: [], mentions: [], media: [], platforms: ['youtube'], accounts: [
        { id: 'public', platform: 'youtube', caption: 'Useful description', postType: 'video', media: [], settings: { privacy: 'public' } },
        { id: 'private', platform: 'youtube', caption: 'Useful description', postType: 'video', media: [], settings: { privacy: 'private' } },
    ] };
    it('warns only about the restricted account without modifying settings', () => {
        const before = JSON.stringify(base);
        const result = check('reach-visibility', base);
        expect(result.status).toBe('warning');
        expect(result.message).toContain('(private)');
        expect(result.message).not.toContain('(public)');
        expect(JSON.stringify(base)).toBe(before);
        expect(result.canAutoFix).toBe(false);
    });
    it('does not claim subtitles are absent or require written captions on Stories', () => {
        const context = { ...base, accounts: [{ ...base.accounts![0], media: [{ id: 'v', type: 'video' as const, mimeType: 'video/mp4', width: 1080, height: 1920, size: 1 }] }] };
        expect(check('reach-video-accessibility', context).message).toContain('cannot be detected');
        context.accounts[0].postType = 'story';
        expect(check('reach-video-accessibility', context).status).toBe('pass');
        expect(check('reach-discovery-metadata', context).status).toBe('pass');
    });
});
