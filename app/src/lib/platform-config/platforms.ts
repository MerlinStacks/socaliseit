import { type Platform, type PlatformSpec } from './types';
import { instagramSpec } from './platforms/instagram';
import { tiktokSpec } from './platforms/tiktok';
import { youtubeSpec } from './platforms/youtube';
import { facebookSpec } from './platforms/facebook';
import { pinterestSpec } from './platforms/pinterest';
import { linkedinSpec } from './platforms/linkedin';
import { blueskySpec } from './platforms/bluesky';
import { threadsSpec } from './platforms/threads';
import { googleBusinessSpec } from './platforms/google-business';
import { manualSpec } from './platforms/manual';

/**
 * Comprehensive platform specifications map
 * Why: Centralizes all platform-specific constraints to ensure consistent validation
 * and UI behavior across the application
 */
export const PLATFORM_SPECS: Record<Platform, PlatformSpec> = {
    instagram: instagramSpec,
    tiktok: tiktokSpec,
    youtube: youtubeSpec,
    facebook: facebookSpec,
    pinterest: pinterestSpec,
    linkedin: linkedinSpec,
    bluesky: blueskySpec,
    threads: threadsSpec,
    google_business: googleBusinessSpec,
    manual: manualSpec,
};
