/**
 * Platform Configuration
 * Why: Centralizes brand colors, gradients, and icons for all supported platforms.
 * Each platform has unique styling for premium visual identity.
 */

import { Instagram, Youtube, Facebook, Linkedin } from 'lucide-react';
import { TikTokIcon, PinterestIcon, GoogleIcon, BlueskyIcon } from './platform-icons';

export const PLATFORM_CONFIG = {
    instagram: {
        id: 'instagram',
        name: 'Instagram',
        icon: Instagram,
        // Instagram's signature gradient
        gradient: 'from-[#833AB4] via-[#FD1D1D] to-[#F77737]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(131,58,180,0.4)]',
        iconBg: 'bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#F77737]',
    },
    youtube: {
        id: 'youtube',
        name: 'YouTube',
        icon: Youtube,
        gradient: 'from-[#FF0000] to-[#CC0000]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(255,0,0,0.3)]',
        iconBg: 'bg-gradient-to-br from-[#FF0000] to-[#CC0000]',
    },
    tiktok: {
        id: 'tiktok',
        name: 'TikTok',
        icon: TikTokIcon,
        // TikTok's signature cyan/magenta
        gradient: 'from-[#00F2EA] via-[#000000] to-[#FF0050]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(0,242,234,0.4)]',
        iconBg: 'bg-black',
    },
    facebook: {
        id: 'facebook',
        name: 'Facebook',
        icon: Facebook,
        gradient: 'from-[#1877F2] to-[#0D5EC4]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(24,119,242,0.4)]',
        iconBg: 'bg-gradient-to-br from-[#1877F2] to-[#0D5EC4]',
    },
    pinterest: {
        id: 'pinterest',
        name: 'Pinterest',
        icon: PinterestIcon,
        gradient: 'from-[#E60023] to-[#BD081C]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(230,0,35,0.4)]',
        iconBg: 'bg-gradient-to-br from-[#E60023] to-[#BD081C]',
    },
    linkedin: {
        id: 'linkedin',
        name: 'LinkedIn',
        icon: Linkedin,
        gradient: 'from-[#0A66C2] to-[#004182]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(10,102,194,0.4)]',
        iconBg: 'bg-gradient-to-br from-[#0A66C2] to-[#004182]',
    },
    google_business: {
        id: 'google_business',
        name: 'Google Business',
        icon: GoogleIcon,
        gradient: 'from-[#4285F4] via-[#34A853] to-[#EA4335]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(66,133,244,0.4)]',
        iconBg: 'bg-gradient-to-br from-[#4285F4] via-[#34A853] to-[#EA4335]',
    },
    bluesky: {
        id: 'bluesky',
        name: 'Bluesky',
        icon: BlueskyIcon,
        gradient: 'from-[#0085FF] to-[#00C7FF]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(0,133,255,0.4)]',
        iconBg: 'bg-gradient-to-br from-[#0085FF] to-[#00C7FF]',
    },
} as const;

export type PlatformId = keyof typeof PLATFORM_CONFIG;

/** Profile URL templates for external links */
export const PLATFORM_PROFILE_URLS: Record<string, string> = {
    INSTAGRAM: 'https://instagram.com/',
    YOUTUBE: 'https://youtube.com/@',
    TIKTOK: 'https://tiktok.com/@',
    FACEBOOK: 'https://facebook.com/',
    PINTEREST: 'https://pinterest.com/',
    LINKEDIN: 'https://linkedin.com/in/',
    GOOGLE_BUSINESS: 'https://business.google.com',
    BLUESKY: 'https://bsky.app/profile/',
};

/**
 * Generate profile URL from account data
 */
export function getProfileUrl(platform: string, username: string | null): string | null {
    const baseUrl = PLATFORM_PROFILE_URLS[platform];
    if (!baseUrl) return null;
    if (platform === 'GOOGLE_BUSINESS') return baseUrl;
    if (!username) return null;
    return `${baseUrl}${username}`;
}
