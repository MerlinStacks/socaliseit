import { type PlatformSpec } from '../types';

export const blueskySpec: PlatformSpec = {
    id: 'bluesky',
    name: 'Bluesky',
    color: '#0085FF',
    icon: 'bluesky',
    deepLink: { webUrl: 'https://bsky.app/' },
    characterLimits: {
        caption: { max: 300 },
    },
    supportedPostTypes: ['feed', 'thread'],
    hashtagLimit: 0, // Bluesky doesn't use traditional hashtags
    mediaConstraints: {
        feed: {
            maxFiles: 4,
            image: {
                minWidth: 100,
                maxWidth: 4096,
                recommendedWidth: 1000,
                aspectRatios: ['any'],
                maxSize: 1 * 1024 * 1024, // 1MB
                formats: ['jpg', 'jpeg', 'png', 'webp'],
            },
        },
        thread: {
            maxFiles: 4,
            image: {
                minWidth: 100,
                maxWidth: 4096,
                recommendedWidth: 1000,
                aspectRatios: ['any'],
                maxSize: 1 * 1024 * 1024,
                formats: ['jpg', 'jpeg', 'png', 'webp'],
            },
        },
    },
    features: {
        scheduledPublishing: true,
        firstComment: false,
        locationTagging: false,
        productTagging: false,
        altText: true,
    },
    variation: {
        hashtagPosition: 'inline',
        linkBehavior: 'embed',
        tone: 'casual, conversational',
        emojiDensity: 'low',
    },
};
