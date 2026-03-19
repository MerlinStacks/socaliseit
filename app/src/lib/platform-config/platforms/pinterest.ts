import { type PlatformSpec } from '../types';

export const pinterestSpec: PlatformSpec = {
    id: 'pinterest',
    name: 'Pinterest',
    color: '#BD081C',
    icon: 'pinterest',
    deepLink: { appUri: 'pinterest://', webUrl: 'https://www.pinterest.com/pin-creation-tool/' },
    characterLimits: {
        caption: { max: 500 },
        title: { max: 100 },
    },
    supportedPostTypes: ['pin', 'carousel', 'video'],
    hashtagLimit: 20,
    mediaConstraints: {
        pin: {
            maxFiles: 1,
            image: {
                minWidth: 600,
                maxWidth: 2000,
                recommendedWidth: 1000,
                aspectRatios: ['2:3', '1:1'],
                maxSize: 20 * 1024 * 1024, // 20MB
                formats: ['jpg', 'jpeg', 'png'],
            },
            video: {
                minDuration: 4,
                maxDuration: 15 * 60, // 15 minutes
                maxSize: 2 * 1024 * 1024 * 1024, // 2GB
                formats: ['mp4', 'mov'],
            },
        },
        carousel: {
            maxFiles: 5,
            image: {
                minWidth: 600,
                maxWidth: 2000,
                recommendedWidth: 1000,
                aspectRatios: ['1:1', '2:3'],
                maxSize: 20 * 1024 * 1024,
                formats: ['jpg', 'jpeg', 'png'],
            },
        },
    },
    features: {
        scheduledPublishing: true,
        firstComment: false,
        locationTagging: false,
        productTagging: true,
        altText: true,
    },
    variation: {
        hashtagPosition: 'end',
        linkBehavior: 'embed',
        tone: 'inspiring, descriptive',
        emojiDensity: 'low',
    },
};
