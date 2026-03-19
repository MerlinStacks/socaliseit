import { type PlatformSpec } from '../types';

export const facebookSpec: PlatformSpec = {
    id: 'facebook',
    name: 'Facebook',
    color: '#1877F2',
    icon: 'facebook',
    deepLink: { appUri: 'fb://', webUrl: 'https://www.facebook.com/' },
    characterLimits: {
        caption: { max: 63206 },
    },
    supportedPostTypes: ['feed', 'reel', 'story', 'carousel'],
    hashtagLimit: 30,
    mediaConstraints: {
        feed: {
            maxFiles: 1,
            image: {
                minWidth: 600,
                maxWidth: 2048,
                recommendedWidth: 1080,
                aspectRatios: ['1:1', '4:5', '16:9', '1.91:1'],
                maxSize: 8 * 1024 * 1024, // 8MB
                formats: ['jpg', 'jpeg', 'png', 'gif'],
            },
            video: {
                minDuration: 1,
                maxDuration: 240 * 60, // 240 minutes
                maxSize: 4 * 1024 * 1024 * 1024, // 4GB
                formats: ['mp4', 'mov'],
            },
        },
        carousel: {
            maxFiles: 10,
            image: {
                minWidth: 600,
                maxWidth: 2048,
                recommendedWidth: 1080,
                aspectRatios: ['1:1'],
                maxSize: 8 * 1024 * 1024,
                formats: ['jpg', 'jpeg', 'png'],
            },
        },
        reel: {
            maxFiles: 1,
            video: {
                minDuration: 3,
                maxDuration: 60,
                maxSize: 1024 * 1024 * 1024,
                formats: ['mp4', 'mov'],
            },
        },
        story: {
            maxFiles: 1,
            image: {
                minWidth: 500,
                maxWidth: 1080,
                recommendedWidth: 1080,
                aspectRatios: ['9:16'],
                maxSize: 30 * 1024 * 1024, // 30MB (2026)
                formats: ['jpg', 'jpeg', 'png'],
            },
            video: {
                minDuration: 1,
                maxDuration: 20,
                maxSize: 100 * 1024 * 1024,
                formats: ['mp4', 'mov'],
            },
        },
    },
    features: {
        scheduledPublishing: true,
        firstComment: false,
        locationTagging: true,
        productTagging: true,
        altText: true,
    },
    variation: {
        hashtagPosition: 'end',
        linkBehavior: 'embed',
        tone: 'conversational, community',
        emojiDensity: 'low',
    },
};
