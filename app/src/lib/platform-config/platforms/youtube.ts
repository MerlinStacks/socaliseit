import { type PlatformSpec } from '../types';

export const youtubeSpec: PlatformSpec = {
    id: 'youtube',
    name: 'YouTube',
    color: '#FF0000',
    icon: 'youtube',
    deepLink: { appUri: 'youtube://upload', webUrl: 'https://studio.youtube.com/' },
    characterLimits: {
        caption: { max: 5000 },
        title: { max: 100 },
        description: { max: 5000 },
    },
    supportedPostTypes: ['video', 'reel'], // Shorts = reel
    hashtagLimit: 15,
    mediaConstraints: {
        video: {
            maxFiles: 1,
            video: {
                minDuration: 1,
                maxDuration: 12 * 60 * 60, // 12 hours
                maxSize: 256 * 1024 * 1024 * 1024, // 256GB
                formats: ['mp4', 'mov', 'avi', 'wmv', 'flv', 'webm', 'mkv'],
            },
        },
        reel: {
            maxFiles: 1,
            video: {
                minDuration: 15,
                maxDuration: 60,
                maxSize: 256 * 1024 * 1024 * 1024,
                formats: ['mp4', 'mov'],
                minWidth: 1080,
                maxWidth: 1920,
            },
        },
    },
    features: {
        scheduledPublishing: true,
        firstComment: false,
        locationTagging: false,
        productTagging: true,
        altText: false,
    },
    variation: {
        hashtagPosition: 'end',
        linkBehavior: 'embed',
        tone: 'informative, engaging',
        emojiDensity: 'medium',
    },
};
