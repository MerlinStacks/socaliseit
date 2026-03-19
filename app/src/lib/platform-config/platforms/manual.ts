import { type PlatformSpec } from '../types';

export const manualSpec: PlatformSpec = {
    id: 'manual',
    name: 'Remind to Post',
    color: '#8B5CF6',
    icon: 'bell',
    characterLimits: {
        caption: { max: 10000 },
    },
    supportedPostTypes: ['feed', 'carousel', 'reel', 'story', 'video'],
    hashtagLimit: 100,
    mediaConstraints: {
        feed: {
            maxFiles: 10,
            image: {
                minWidth: 100,
                maxWidth: 10000,
                recommendedWidth: 1080,
                aspectRatios: ['any'],
                maxSize: 100 * 1024 * 1024,
                formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
            },
            video: {
                minDuration: 1,
                maxDuration: 3600,
                maxSize: 4 * 1024 * 1024 * 1024,
                formats: ['mp4', 'mov', 'webm'],
            },
        },
        carousel: {
            maxFiles: 20,
            image: {
                minWidth: 100,
                maxWidth: 10000,
                recommendedWidth: 1080,
                aspectRatios: ['any'],
                maxSize: 100 * 1024 * 1024,
                formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
            },
        },
    },
    features: {
        scheduledPublishing: false,
        firstComment: false,
        locationTagging: false,
        productTagging: false,
        altText: false,
    },
    variation: {
        hashtagPosition: 'end',
        linkBehavior: 'embed',
        tone: 'flexible',
        emojiDensity: 'medium',
    },
};
