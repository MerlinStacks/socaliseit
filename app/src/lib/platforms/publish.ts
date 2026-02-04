/**
 * Platform Publishing Module (Legacy Re-Export)
 * 
 * Why: This file has been decomposed into the /publishing/ directory.
 * This re-export maintains backward compatibility with existing imports.
 * 
 * Decomposition Summary:
 * - Original: 868 lines
 * - New structure: 10 files (~890 lines total)
 * 
 * Modules extracted:
 * - orchestrator.ts: Main publishToPlatform router (53 lines)
 * - instagram.ts: Instagram (Feed, Story, Reel)
 * - facebook.ts: Facebook (Page Posts, Stories, Reels)
 * - tiktok.ts: TikTok videos
 * - youtube.ts: YouTube (Videos, Shorts)
 * - pinterest.ts: Pinterest (Pins, Carousels)
 * - linkedin.ts: LinkedIn (Posts, Articles)
 * - bluesky.ts: Bluesky (Posts, Threads)
 * - google-business.ts: Google Business local posts
 * - index.ts: Barrel re-exports
 */

// Re-export all functions from the decomposed module
export { publishToPlatform } from './publishing/index';

// Re-export platform-specific publishers for direct access
export {
    publishToInstagram,
    publishToFacebook,
    publishToTikTok,
    publishToYouTube,
    publishToPinterest,
    publishToLinkedIn,
    publishToBluesky,
    publishToGoogleBusiness,
} from './publishing/index';
