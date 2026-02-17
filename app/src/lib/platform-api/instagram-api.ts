/**
 * Instagram Graph API Integration (Legacy Re-Export)
 * 
 * Why: This file has been decomposed into the /instagram/ directory.
 * This re-export maintains backward compatibility with existing imports.
 * 
 * Decomposition Summary:
 * - Original: 1,005 lines
 * - New structure: 7 files (~986 lines total)
 * 
 * Modules extracted:
 * - constants.ts: API URLs
 * - analytics.ts: Account and post insights
 * - comments.ts: Comment fetching and replying
 * - hashtags.ts: UGC discovery via hashtag search
 * - publishing.ts: Story, Reel, and Feed publishing
 * - upload.ts: Local file handling and resumable upload
 * - index.ts: Barrel re-exports
 */

// Re-export all functions from the decomposed module
export {
    // Analytics
    getInstagramAnalytics,
    getInstagramPostAnalytics,
    getInstagramOnlineFollowers,

    // Comments
    getInstagramComments,
    replyToInstagramComment,

    // Hashtags & UGC
    getInstagramMentions,
    searchInstagramHashtag,
    getHashtagTopMedia,
    getHashtagRecentMedia,
    searchInstagramHashtagWithMedia,

    // Publishing
    publishInstagramStory,
    publishTrialReel,
    publishInstagramFeedPost,

    // Upload utilities
    isLocalUrl,
    resolveLocalFilePath,
    waitForContainerReady,
    uploadLocalVideoToInstagram,

    // Constants
    GRAPH_API_URL,
} from './instagram/index';
