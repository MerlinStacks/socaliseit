/**
 * Inline Validation Helpers
 * Real-time feedback functions for caption, hashtag, and media validation.
 * 
 * Why: Provides immediate feedback as user types in composer,
 * showing progress toward limits before full validation runs.
 */

import type { CharacterStatus, CharacterCountResult, HashtagCountResult, MediaAspectResult } from './types';
import { PLATFORM_LIMITS } from './limits';

/**
 * Get real-time character count status for a specific platform.
 * Provides immediate feedback as user types.
 */
export function getCharacterStatus(
    text: string,
    platform: keyof typeof PLATFORM_LIMITS
): CharacterCountResult {
    const limits = PLATFORM_LIMITS[platform];
    if (!('caption' in limits)) {
        // Platform doesn't have caption limits (e.g., some video-only platforms)
        return {
            count: text.length,
            limit: Infinity,
            status: 'ok',
            remaining: Infinity,
            percentage: 0,
        };
    }

    const { max, recommended } = limits.caption as { max: number; recommended?: number };
    const count = text.length;
    const remaining = max - count;
    const percentage = (count / max) * 100;

    let status: CharacterStatus = 'ok';
    if (count > max) {
        status = 'error';
    } else if (recommended && count > recommended) {
        status = 'warning';
    } else if (percentage > 80) {
        status = 'warning';
    }

    return {
        count,
        limit: max,
        recommended,
        status,
        remaining,
        percentage: Math.min(percentage, 100),
    };
}

/**
 * Get hashtag count status with platform-specific warnings.
 * Different platforms have different hashtag limits and best practices.
 */
export function getHashtagStatus(
    hashtags: string[],
    platform: keyof typeof PLATFORM_LIMITS
): HashtagCountResult {
    const limits = PLATFORM_LIMITS[platform];
    if (!('hashtags' in limits)) {
        return { count: hashtags.length, limit: Infinity, status: 'ok' };
    }

    const { max, recommended } = limits.hashtags as { max: number; recommended?: number };
    const count = hashtags.length;

    let status: CharacterStatus = 'ok';
    let message: string | undefined;

    if (count > max) {
        status = 'error';
        message = `Max ${max} hashtags allowed`;
    } else if (recommended && count > recommended) {
        status = 'warning';
        message = `${recommended} hashtags recommended for best engagement`;
    } else if (max > 0 && count > max * 0.8) {
        status = 'warning';
        message = `Approaching limit of ${max}`;
    }

    return { count, limit: max, recommended, status, message };
}

/**
 * Validate image/video aspect ratio for a platform before upload completes.
 * Catches dimension issues early to save users from failed uploads.
 */
export function getMediaAspectStatus(
    width: number,
    height: number,
    platform: keyof typeof PLATFORM_LIMITS,
    _mediaType: 'image' | 'video' = 'image'
): MediaAspectResult {
    const ratio = width / height;
    const ratioString = formatAspectRatio(ratio);

    // Default result for platforms without aspect limits
    const defaultResult: MediaAspectResult = {
        ratio,
        ratioString,
        status: 'ok',
        message: `Aspect ratio: ${ratioString}`,
        isOptimal: true,
    };

    if (platform === 'instagram') {
        // Instagram optimal ratios: 1:1 (square), 1.91:1 (landscape), 4:5 (portrait)
        const isSquare = Math.abs(ratio - 1) < 0.05;
        const isLandscape = Math.abs(ratio - 1.91) < 0.15;
        const isPortrait = Math.abs(ratio - 0.8) < 0.1;

        if (isSquare || isLandscape || isPortrait) {
            return { ...defaultResult, message: `Optimal: ${ratioString}` };
        }
        return {
            ratio,
            ratioString,
            status: 'warning',
            message: `${ratioString} may be cropped. Use 1:1, 4:5, or 1.91:1`,
            isOptimal: false,
        };
    }

    if (platform === 'tiktok') {
        // TikTok optimal: 9:16 (vertical)
        const isVertical = Math.abs(ratio - 0.5625) < 0.05;
        if (isVertical) {
            return { ...defaultResult, message: `Optimal: ${ratioString} (9:16)` };
        }
        return {
            ratio,
            ratioString,
            status: 'warning',
            message: `${ratioString} not optimal. Use 9:16 for TikTok`,
            isOptimal: false,
        };
    }

    if (platform === 'pinterest') {
        // Pinterest optimal: 2:3 (tall)
        const isTall = Math.abs(ratio - 0.667) < 0.1;
        if (isTall) {
            return { ...defaultResult, message: `Optimal: ${ratioString} (2:3)` };
        }
        return {
            ratio,
            ratioString,
            status: 'warning',
            message: `${ratioString} not optimal. Use 2:3 for Pinterest`,
            isOptimal: false,
        };
    }

    return defaultResult;
}

/**
 * Format aspect ratio as human-readable string.
 */
function formatAspectRatio(ratio: number): string {
    if (Math.abs(ratio - 1) < 0.05) return '1:1';
    if (Math.abs(ratio - 1.91) < 0.1) return '1.91:1';
    if (Math.abs(ratio - 0.8) < 0.05) return '4:5';
    if (Math.abs(ratio - 0.5625) < 0.05) return '9:16';
    if (Math.abs(ratio - 1.778) < 0.05) return '16:9';
    if (Math.abs(ratio - 0.667) < 0.05) return '2:3';
    return `${ratio.toFixed(2)}:1`;
}
