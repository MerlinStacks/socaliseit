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
// Analytics
export { getInstagramAnalytics, getInstagramPostAnalytics, getInstagramStoryAnalytics, getInstagramOnlineFollowers } from './instagram/analytics';

// Comments
export { getInstagramComments, replyToInstagramComment } from './instagram/comments';

// Hashtags & UGC
export {
    getInstagramMentions,
    searchInstagramHashtag,
    getHashtagTopMedia,
    getHashtagRecentMedia,
    searchInstagramHashtagWithMedia,
} from './instagram/hashtags';

// Publishing
export {
    publishInstagramStory,
    publishTrialReel,
    publishInstagramFeedPost,
} from './instagram/publishing';

// Upload utilities
export {
    isLocalUrl,
    resolveLocalFilePath,
    waitForContainerReady,
    uploadLocalVideoToInstagram,
} from './instagram/upload';

// Collabs (Phase 2 — 2026)
export { getInstagramCollabInvites, respondToInstagramCollab } from './instagram/collabs';
export type { InstagramCollabInvite } from './instagram/collabs';

// Deletion (Phase 2 — 2026)
export { deleteInstagramMedia } from './instagram/deletion';

// Constants
export { GRAPH_API_URL } from './instagram/constants';
