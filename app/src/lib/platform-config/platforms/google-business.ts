import { type PlatformSpec } from '../types';

export const googleBusinessSpec: PlatformSpec = {
    id: 'google_business',
    name: 'Google My Business',
    color: '#4285F4',
    icon: 'google',
    deepLink: { webUrl: 'https://business.google.com/' },
    characterLimits: {
        caption: { max: 1500 },
    },
    supportedPostTypes: ['feed'],
    callToActions: [
        { id: 'learn_more', label: 'Learn More' },
        { id: 'book', label: 'Book' },
        { id: 'order', label: 'Order Online' },
        { id: 'shop', label: 'Shop' },
        { id: 'sign_up', label: 'Sign Up' },
        { id: 'call', label: 'Call Now' },
    ],
    mediaConstraints: {
        feed: {
            maxFiles: 1,
            image: {
                minWidth: 400,
                maxWidth: 4096,
                recommendedWidth: 1200,
                aspectRatios: ['4:3', '1:1'],
                maxSize: 5 * 1024 * 1024, // 5MB
                formats: ['jpg', 'jpeg', 'png'],
            },
            video: {
                minDuration: 1,
                maxDuration: 30,
                maxSize: 75 * 1024 * 1024, // 75MB
                formats: ['mp4', 'mov'],
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
        tone: 'professional, local-focused',
        emojiDensity: 'low',
    },
};
