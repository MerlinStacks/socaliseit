/**
 * Instagram API Module
 * Why: Barrel export for cleaner imports.
 * 
 * Decomposition:
 * - analytics.ts: Account and post insights
 * - comments.ts: Comment fetching and replying
 * - hashtags.ts: UGC discovery via hashtag search
 * - publishing.ts: Story, Reel, and Feed publishing
 * - upload.ts: Local file handling and resumable upload
 * - constants.ts: API URLs and config
 */

// Analytics
export { getInstagramAnalytics, getInstagramPostAnalytics, getInstagramStoryAnalytics, getInstagramOnlineFollowers } from './analytics';
export type { OnlineFollowersGrid } from './analytics';

// Comments
export { getInstagramComments, replyToInstagramComment } from './comments';

// Hashtags & UGC
export {
    getInstagramMentions,
    searchInstagramHashtag,
    getHashtagTopMedia,
    getHashtagRecentMedia,
    searchInstagramHashtagWithMedia,
} from './hashtags';

// Publishing
export {
    publishInstagramStory,
    publishTrialReel,
    publishInstagramFeedPost,
} from './publishing';

// Upload utilities (exported for potential reuse)
export {
    isLocalUrl,
    resolveLocalFilePath,
    waitForContainerReady,
    uploadLocalVideoToInstagram,
    createVideoContainer,
} from './upload';

// Business Discovery (Competitor Lookup)
export {
    getBusinessDiscoveryProfile,
    getBusinessDiscoveryMedia,
} from './business-discovery';
export type { DiscoveredProfile, DiscoveredMedia } from './business-discovery';

// Constants
export { GRAPH_API_URL } from './constants';
