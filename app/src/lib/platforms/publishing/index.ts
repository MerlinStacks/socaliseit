/**
 * Platform Publishing Module
 * Why: Barrel export for cleaner imports.
 * 
 * Decomposition:
 * - orchestrator.ts: Main publishToPlatform router
 * - instagram.ts: Instagram (Feed, Story, Reel)
 * - facebook.ts: Facebook (Page Posts, Stories, Reels)
 * - tiktok.ts: TikTok videos
 * - youtube.ts: YouTube (Videos, Shorts)
 * - pinterest.ts: Pinterest (Pins, Carousels)
 * - linkedin.ts: LinkedIn (Posts, Articles)
 * - bluesky.ts: Bluesky (Posts, Threads)
 * - threads.ts: Threads (Posts, Carousels)
 * - google-business.ts: Google Business local posts
 * - types.ts: Type re-exports
 */

// Main orchestrator
export { publishToPlatform } from './orchestrator';

// Platform-specific publishers (exported for potential direct use)
export { publishToInstagram } from './instagram';
export { publishToFacebook } from './facebook';
export { publishToTikTok } from './tiktok';
export { publishToYouTube } from './youtube';
export { publishToPinterest } from './pinterest';
export { publishToLinkedIn } from './linkedin';
export { publishToBluesky } from './bluesky';
export { publishToThreads } from './threads';
export { publishToGoogleBusiness } from './google-business';

// Types
export type { PlatformAccount, PublishPayload, PublishResponse } from './types';
