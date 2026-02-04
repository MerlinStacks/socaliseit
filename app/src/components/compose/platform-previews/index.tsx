/**
 * Platform Preview Components - Main Entry Point
 * Re-exports all platform previews and the orchestrator component
 */

'use client';

import { type Platform, type PostType, PLATFORM_SPECS } from '@/lib/platform-config';
import type { MediaItem } from '../platform-editor';

// Per-platform previews
import { InstagramFeedPreview, InstagramReelPreview, InstagramStoryPreview } from './instagram-preview';
import { TikTokPreview } from './tiktok-preview';
import { YouTubePreview, YouTubeShortsPreview } from './youtube-preview';
import { FacebookPreview, FacebookStoryPreview, PinterestPreview, LinkedInPreview, BlueskyPreview, GoogleBusinessPreview } from './other-previews';

// Re-export shared components
export { PhoneFrame, type PreviewProps } from './shared';

export interface PlatformPreviewProps {
    platform: Platform;
    postType: PostType;
    caption: string;
    media: MediaItem[];
    accountName?: string;
}

/**
 * Orchestrator component that renders the appropriate platform preview
 */
export function PlatformPreview({ platform, postType, caption, media, accountName }: PlatformPreviewProps) {
    const props = { caption, media, accountName };

    switch (platform) {
        case 'instagram':
            if (postType === 'reel') return <InstagramReelPreview {...props} />;
            if (postType === 'story') return <InstagramStoryPreview {...props} />;
            return <InstagramFeedPreview {...props} />;

        case 'tiktok':
            return <TikTokPreview {...props} />;

        case 'youtube':
            if (postType === 'reel') return <YouTubeShortsPreview {...props} />;
            return <YouTubePreview {...props} />;

        case 'facebook':
            if (postType === 'story') return <FacebookStoryPreview {...props} />;
            return <FacebookPreview {...props} />;

        case 'pinterest':
            return <PinterestPreview {...props} />;

        case 'linkedin':
            return <LinkedInPreview {...props} />;

        case 'bluesky':
            return <BlueskyPreview {...props} />;

        case 'google_business':
            return <GoogleBusinessPreview {...props} />;

        default:
            return <InstagramFeedPreview {...props} />;
    }
}
