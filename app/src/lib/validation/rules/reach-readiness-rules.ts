import type { ValidationContext, ValidationRule } from '../types';
import { publishingCapabilityWarnings } from '@/lib/publishing-capabilities';
import { validatePublishingMetadata } from '@/lib/publishing-metadata';

const accounts = (context: ValidationContext) => context.accounts || context.platforms.map(platform => ({
    id: platform, platform, caption: context.caption, postType: context.postTypes?.[platform] || 'feed',
    media: context.media, settings: context.platformSettings?.[platform] || {},
}));

function rule(id: string, check: (account: ReturnType<typeof accounts>[number]) => string[], error = false): ValidationRule {
    return { id, platform: 'all', type: 'postType', check: context => {
        const messages = accounts(context).flatMap(account => check(account).map(message => `${account.platform} (${account.id}): ${message}`));
        return messages.length
            ? { status: error ? 'error' : 'warning', message: messages.join(' '), canAutoFix: false }
            : { status: 'pass', message: 'No additional action needed' };
    } };
}

/** Advisory checks, not an algorithm score. Never auto-change privacy, disclosure, or tags. */
export const reachReadinessRules: ValidationRule[] = [
    rule('publishing-metadata-valid', account => {
        const error = validatePublishingMetadata(account.settings, account.media.length);
        return error ? [error] : [];
    }, true),
    rule('publishing-capabilities', account => publishingCapabilityWarnings(account.platform, {
        ...account.settings, postType: account.postType,
        youtubeCommentsEnabled: account.settings.commentsEnabled as boolean | undefined,
    })),
    rule('reach-visibility', ({ platform, settings }) => {
        const restricted = platform === 'youtube' && ['private', 'unlisted'].includes(String(settings.privacy))
            || platform === 'linkedin' && settings.linkedinVisibility === 'CONNECTIONS'
            || platform === 'tiktok' && settings.tiktokPrivacyLevel && settings.tiktokPrivacyLevel !== 'PUBLIC_TO_EVERYONE';
        return restricted ? ['Your selected audience limits public discovery. Keep it if intentional; privacy will not be changed automatically.'] : [];
    }),
    rule('reach-interactions', ({ platform, settings }) => {
        const disabled = platform === 'instagram' && settings.instagramComments === false
            || platform === 'tiktok' && (settings.tiktokCommentsEnabled === false || settings.tiktokDuetsEnabled === false || settings.tiktokStitchesEnabled === false);
        return disabled ? ['Some interactions are disabled. Review whether this is intentional; settings will be respected.'] : [];
    }),
    rule('reach-video-accessibility', ({ platform, postType, media, settings }) => {
        if (postType === 'story' || !media.some(item => item.type === 'video')) return [];
        if (platform === 'youtube' && Array.isArray(settings.subtitleTracks) && settings.subtitleTracks.length) return [];
        return ['Review spoken-word accessibility: include readable on-screen captions or a subtitle track where supported. Existing burned-in captions cannot be detected by this check.'];
    }),
    rule('reach-discovery-metadata', ({ platform, postType, caption, settings }) => {
        if (postType === 'story') return [];
        const messages: string[] = [];
        if (platform === 'pinterest' && !String(settings.pinTitle || '').trim()) messages.push('Write a descriptive Pin title instead of relying on the caption fallback.');
        if (platform === 'pinterest' && !String(settings.pinLink || '').trim()) messages.push('Add a relevant destination link if this Pin should drive website visits.');
        if (platform === 'threads' && !String(settings.threadsTopicTag || '').trim()) messages.push('Consider one relevant Threads topic. Do not add an unrelated topic just for reach.');
        if (platform === 'youtube' && !caption.trim()) messages.push('Add a useful video description with relevant context.');
        return messages;
    }),
    rule('reach-instagram-feed-sharing', ({ platform, postType, media, settings }) =>
        platform === 'instagram' && postType !== 'story' && media.some(item => item.type === 'video') && settings.instagramShareToFeed === false
            ? ['Feed sharing is off. Your Reel will be submitted without feed distribution; keep this if intentional.'] : []),
    rule('reach-video-cover', ({ postType, media }) => postType !== 'story' && media.some(item => item.type === 'video')
        ? ['Review the video cover/thumbnail before publishing. A clear, readable cover helps viewers understand the video; a custom cover is not required.'] : []),
    rule('reach-media-fit', ({ platform, postType, media }) => {
        const portrait = postType === 'reel' || postType === 'story' || platform === 'tiktok';
        const mismatch = portrait && media.some(item => item.width > 0 && item.height > 0 && Math.abs(item.width / item.height - 9 / 16) > 0.05);
        return mismatch ? ['Review the preview for vertical placement: 9:16 avoids common cropping or letterboxing. No automatic crop is applied by this check.'] : [];
    }),
];
