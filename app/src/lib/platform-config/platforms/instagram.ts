import { type PlatformSpec } from '../types';

export const instagramSpec: PlatformSpec = {
    id: 'instagram',
    name: 'Instagram',
    color: '#E4405F',
    icon: 'instagram',
    deepLink: { appUri: 'instagram://', webUrl: 'https://www.instagram.com/' },
    characterLimits: {
        caption: { max: 2200, recommended: 125 },
        firstComment: { max: 2200 },
    },
    supportedPostTypes: ['feed', 'reel', 'story', 'carousel'],
    hashtagLimit: 30,
    mentionLimit: 20,
    mediaConstraints: {
        feed: {
            maxFiles: 1,
            image: {
                minWidth: 320,
                maxWidth: 1440,
                recommendedWidth: 1080,
                aspectRatios: ['1:1', '4:5', '3:4', '1.91:1'],
                maxSize: 8 * 1024 * 1024, // 8MB
                formats: ['jpg', 'jpeg', 'png'],
            },
        },
        carousel: {
            maxFiles: 10,
            image: {
                minWidth: 320,
                maxWidth: 1440,
                recommendedWidth: 1080,
                aspectRatios: ['1:1', '4:5'],
                maxSize: 8 * 1024 * 1024,
                formats: ['jpg', 'jpeg', 'png'],
            },
            video: {
                minDuration: 3,
                maxDuration: 60,
                maxSize: 100 * 1024 * 1024, // 100MB
                formats: ['mp4', 'mov'],
            },
        },
        reel: {
            maxFiles: 1,
            video: {
                minDuration: 3,
                maxDuration: 180, // 3 minutes (2026)
                maxSize: 1024 * 1024 * 1024, // 1GB
                formats: ['mp4', 'mov'],
                minWidth: 500,
                maxWidth: 1920,
            },
        },
        story: {
            maxFiles: 1,
            image: {
                minWidth: 600,
                maxWidth: 1080,
                recommendedWidth: 1080,
                aspectRatios: ['9:16'],
                maxSize: 8 * 1024 * 1024,
                formats: ['jpg', 'jpeg', 'png'],
            },
            video: {
                minDuration: 1,
                maxDuration: 15,
                maxSize: 100 * 1024 * 1024,
                formats: ['mp4', 'mov'],
            },
        },
    },
    features: {
        scheduledPublishing: true,
        firstComment: true,
        locationTagging: true,
        productTagging: true,
        altText: true,
    },
    variation: {
        hashtagPosition: 'end',
        linkBehavior: 'bio',
        tone: 'casual, visual-focused',
        emojiDensity: 'high',
    },
};
