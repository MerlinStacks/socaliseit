/**
 * Platform UI Configuration
 * Icons, colors, gradients, and styling for platform branding.
 * 
 * Why: Centralizes all UI-related platform config for consistent
 * visual identity across components.
 */

import { Instagram, Youtube, Facebook, Linkedin, type LucideIcon } from 'lucide-react';
import { PLATFORM_SPECS, type Platform } from '../platform-config';

// Custom icons (not in lucide-react)
export { TikTokIcon, PinterestIcon, GoogleIcon, BlueskyIcon } from '@/components/settings/connected-accounts/platform-icons';

export interface PlatformUIConfig {
    id: Platform;
    name: string;
    icon: LucideIcon | React.ComponentType<{ className?: string }>;
    /** Hex color from PLATFORM_SPECS */
    color: string;
    /** Tailwind gradient classes */
    gradient: string;
    /** Hover glow effect */
    hoverGlow: string;
    /** Icon background gradient */
    iconBg: string;
    /** Border color class for calendar/lists */
    borderColor: string;
    /** Background color class */
    bgColor: string;
}

/**
 * Platform gradients and glow effects for premium UI.
 * Values derived from official brand guidelines.
 */
export const PLATFORM_GRADIENTS: Record<Platform, { gradient: string; hoverGlow: string; iconBg: string }> = {
    instagram: {
        gradient: 'from-[#833AB4] via-[#FD1D1D] to-[#F77737]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(131,58,180,0.4)]',
        iconBg: 'bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#F77737]',
    },
    youtube: {
        gradient: 'from-[#FF0000] to-[#CC0000]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(255,0,0,0.3)]',
        iconBg: 'bg-gradient-to-br from-[#FF0000] to-[#CC0000]',
    },
    tiktok: {
        gradient: 'from-[#00F2EA] via-[#000000] to-[#FF0050]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(0,242,234,0.4)]',
        iconBg: 'bg-black',
    },
    facebook: {
        gradient: 'from-[#1877F2] to-[#0D5EC4]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(24,119,242,0.4)]',
        iconBg: 'bg-gradient-to-br from-[#1877F2] to-[#0D5EC4]',
    },
    pinterest: {
        gradient: 'from-[#E60023] to-[#BD081C]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(230,0,35,0.4)]',
        iconBg: 'bg-gradient-to-br from-[#E60023] to-[#BD081C]',
    },
    linkedin: {
        gradient: 'from-[#0A66C2] to-[#004182]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(10,102,194,0.4)]',
        iconBg: 'bg-gradient-to-br from-[#0A66C2] to-[#004182]',
    },
    google_business: {
        gradient: 'from-[#4285F4] via-[#34A853] to-[#EA4335]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(66,133,244,0.4)]',
        iconBg: 'bg-gradient-to-br from-[#4285F4] via-[#34A853] to-[#EA4335]',
    },
    bluesky: {
        gradient: 'from-[#0085FF] to-[#00C7FF]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(0,133,255,0.4)]',
        iconBg: 'bg-gradient-to-br from-[#0085FF] to-[#00C7FF]',
    },
    threads: {
        gradient: 'from-[#000000] to-[#333333]',
        hoverGlow: 'hover:shadow-[0_0_30px_rgba(0,0,0,0.3)]',
        iconBg: 'bg-black',
    },
};

/**
 * Platform color classes for Tailwind (bg-, border-, text-)
 * Derived from PLATFORM_SPECS.color hex values.
 */
export const PLATFORM_COLORS: Record<Platform, { bg: string; border: string; text: string }> = {
    instagram: { bg: 'bg-pink-500', border: 'border-l-pink-500', text: 'text-pink-500' },
    tiktok: { bg: 'bg-gray-900', border: 'border-l-gray-900', text: 'text-gray-900' },
    youtube: { bg: 'bg-red-500', border: 'border-l-red-500', text: 'text-red-500' },
    facebook: { bg: 'bg-blue-500', border: 'border-l-blue-500', text: 'text-blue-500' },
    pinterest: { bg: 'bg-red-400', border: 'border-l-red-400', text: 'text-red-400' },
    linkedin: { bg: 'bg-blue-700', border: 'border-l-blue-700', text: 'text-blue-700' },
    bluesky: { bg: 'bg-sky-500', border: 'border-l-sky-500', text: 'text-sky-500' },
    threads: { bg: 'bg-gray-900', border: 'border-l-gray-900', text: 'text-gray-900' },
    google_business: { bg: 'bg-blue-400', border: 'border-l-blue-400', text: 'text-blue-400' },
};

/**
 * Get platform color (bg class) for a platform ID
 */
export function getPlatformBgColor(platform: string): string {
    return PLATFORM_COLORS[platform as Platform]?.bg ?? 'bg-gray-500';
}

/**
 * Get platform border color class
 */
export function getPlatformBorderColor(platform: string): string {
    return PLATFORM_COLORS[platform as Platform]?.border ?? 'border-l-gray-500';
}

/** Profile URL templates for external links */
export const PLATFORM_PROFILE_URLS: Record<string, string> = {
    instagram: 'https://instagram.com/',
    youtube: 'https://youtube.com/@',
    tiktok: 'https://tiktok.com/@',
    facebook: 'https://facebook.com/',
    pinterest: 'https://pinterest.com/',
    linkedin: 'https://linkedin.com/in/',
    google_business: 'https://business.google.com',
    bluesky: 'https://bsky.app/profile/',
    threads: 'https://threads.net/@',
};

/**
 * Generate profile URL from account data
 */
export function getProfileUrl(platform: string, username: string | null): string | null {
    const baseUrl = PLATFORM_PROFILE_URLS[platform.toLowerCase()];
    if (!baseUrl) return null;
    if (platform.toLowerCase() === 'google_business') return baseUrl;
    if (!username) return null;
    return `${baseUrl}${username}`;
}
