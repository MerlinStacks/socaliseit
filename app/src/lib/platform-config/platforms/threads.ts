import { type PlatformSpec } from '../types';

export const threadsSpec: PlatformSpec = {
    id: 'threads',
    name: 'Threads',
    color: '#000000',
    icon: 'threads',
    deepLink: { appUri: 'barcelona://', webUrl: 'https://www.threads.net/' },
    characterLimits: {
        caption: { max: 500, recommended: 280 },
    },
    supportedPostTypes: ['feed', 'carousel'],
    hashtagLimit: 0, // Threads doesn't emphasize hashtags
    mediaConstraints: {
        feed: {
            maxFiles: 1,
            image: {
                minWidth: 320,
                maxWidth: 1440,
                recommendedWidth: 1440,
                aspectRatios: ['any', '3:4'],
                maxSize: 8 * 1024 * 1024, // 8MB
                formats: ['jpg', 'jpeg', 'png', 'webp'],
            },
            video: {
                minDuration: 0,
                maxDuration: 300, // 5 minutes
                maxSize: 1024 * 1024 * 1024, // 1GB
                formats: ['mp4', 'mov'],
            },
        },
        carousel: {
            maxFiles: 10,
            image: {
                minWidth: 320,
                maxWidth: 1440,
                recommendedWidth: 1440,
                aspectRatios: ['any', '3:4'],
                maxSize: 8 * 1024 * 1024,
                formats: ['jpg', 'jpeg', 'png', 'webp'],
            },
            video: {
                minDuration: 0,
                maxDuration: 300,
                maxSize: 1024 * 1024 * 1024,
                formats: ['mp4', 'mov'],
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
        tone: 'casual, conversational, text-first',
        emojiDensity: 'medium',
    },
};
