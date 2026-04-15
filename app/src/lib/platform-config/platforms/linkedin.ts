import { type PlatformSpec } from '../types';

export const linkedinSpec: PlatformSpec = {
    id: 'linkedin',
    name: 'LinkedIn',
    color: '#0A66C2',
    icon: 'linkedin',
    deepLink: { appUri: 'linkedin://', webUrl: 'https://www.linkedin.com/feed/' },
    characterLimits: {
        caption: { max: 3000, recommended: 150 },
        title: { max: 200 },
    },
    supportedPostTypes: ['feed', 'carousel', 'video', 'article'],
    callToActions: [
        { id: 'APPLY', label: 'Apply' },
        { id: 'DOWNLOAD', label: 'Download' },
        { id: 'LEARN_MORE', label: 'Learn More' },
        { id: 'REGISTER', label: 'Register' },
        { id: 'SIGN_UP', label: 'Sign Up' },
        { id: 'SUBSCRIBE', label: 'Subscribe' },
        { id: 'BUY_NOW', label: 'Buy Now' },
        { id: 'SHOP_NOW', label: 'Shop Now' },
    ],
    hashtagLimit: 5,
    mediaConstraints: {
        feed: {
            maxFiles: 1,
            image: {
                minWidth: 552,
                maxWidth: 2048,
                recommendedWidth: 1200,
                aspectRatios: ['1:1', '1.91:1', '4:5'],
                maxSize: 8 * 1024 * 1024, // 8MB
                formats: ['jpg', 'jpeg', 'png', 'gif'],
            },
            video: {
                minDuration: 3,
                maxDuration: 10 * 60, // 10 minutes
                maxSize: 5 * 1024 * 1024 * 1024, // 5GB
                formats: ['mp4', 'mov'],
            },
        },
        carousel: {
            maxFiles: 20,
            image: {
                minWidth: 552,
                maxWidth: 2048,
                recommendedWidth: 1080,
                aspectRatios: ['1:1', '1.91:1'],
                maxSize: 8 * 1024 * 1024,
                formats: ['jpg', 'jpeg', 'png', 'pdf'],
            },
        },
        video: {
            maxFiles: 1,
            video: {
                minDuration: 3,
                maxDuration: 10 * 60,
                maxSize: 5 * 1024 * 1024 * 1024,
                formats: ['mp4', 'mov'],
            },
        },
        article: {
            maxFiles: 1,
            image: {
                minWidth: 744,
                maxWidth: 2048,
                recommendedWidth: 1200,
                aspectRatios: ['1.91:1'],
                maxSize: 8 * 1024 * 1024,
                formats: ['jpg', 'jpeg', 'png'],
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
        hashtagPosition: 'end',
        linkBehavior: 'embed',
        tone: 'professional, insightful',
        emojiDensity: 'low',
    },
};
