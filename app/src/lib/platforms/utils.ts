/**
 * Platform Utilities
 * Helper functions for token management and platform display info.
 * 
 * Why: Keeps utility functions separate from core OAuth/publishing logic.
 */

import type { Platform } from '../platform-config';
import type { PlatformAccount } from './types';

/**
 * Check if account token needs refresh (expires within threshold).
 */
export function isTokenExpiringSoon(account: PlatformAccount, daysThreshold: number = 7): boolean {
    const now = new Date();
    const threshold = new Date(now.getTime() + daysThreshold * 24 * 60 * 60 * 1000);
    return account.tokenExpiresAt < threshold;
}

/**
 * Platform display information for UI rendering.
 */
export interface PlatformInfo {
    name: string;
    color: string;
    icon: string;
}

/**
 * Get display information for a platform.
 */
export function getPlatformInfo(platform: Platform): PlatformInfo {
    const info: Record<Platform, PlatformInfo> = {
        instagram: { name: 'Instagram', color: '#E4405F', icon: '📸' },
        tiktok: { name: 'TikTok', color: '#000000', icon: '🎵' },
        youtube: { name: 'YouTube', color: '#FF0000', icon: '▶️' },
        facebook: { name: 'Facebook', color: '#1877F2', icon: '📘' },
        pinterest: { name: 'Pinterest', color: '#BD081C', icon: '📌' },
        linkedin: { name: 'LinkedIn', color: '#0A66C2', icon: '💼' },
        bluesky: { name: 'Bluesky', color: '#0085FF', icon: '🦋' },
        google_business: { name: 'Google Business', color: '#4285F4', icon: '🏢' },
    };

    return info[platform];
}
