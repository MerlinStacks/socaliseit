/**
 * Platform Settings Input Type
 * Why: Single source of truth for the per-platform settings payload shape.
 * Previously duplicated inline in compose-actions.ts and posts/route.ts,
 * causing silent field drift when one was updated but not the other.
 */

export interface PlatformSettingsInput {
    postType?: string;
    callToAction?: string;
    caption?: string;
    mediaIds?: string[];
    firstComment?: string;
    // Pinterest-specific fields
    pinTitle?: string;
    pinLink?: string;
    boardId?: string;
    // Location tagging (Instagram, TikTok, Facebook)
    location?: string;
    // YouTube-specific fields
    videoTitle?: string;
    youtubeCategory?: string;
    youtubePlaylist?: string;
    videoTags?: string[];
    createFirstLike?: boolean;
    embeddable?: boolean;
    notifySubscribers?: boolean;
    madeForKids?: boolean;
    youtubePrivacy?: 'public' | 'private' | 'unlisted';
    youtubeCommentsEnabled?: boolean;
    // LinkedIn-specific fields
    linkedinVisibility?: string;
    // TikTok-specific fields
    tiktokPrivacyLevel?: string;
    tiktokContentDisclosure?: boolean;
    tiktokBrandOrganic?: boolean;
    tiktokBrandContent?: boolean;
    tiktokIsAigc?: boolean;
    tiktokComments?: boolean;
    tiktokDuets?: boolean;
    tiktokStitches?: boolean;
    // Threads-specific fields
    threadsTopicTag?: string;
    threadsQuotePostId?: string;
    // Instagram-specific fields
    instagramShareToFeed?: boolean;
    instagramComments?: boolean;
    isTrialReel?: boolean;
    // Alt text for accessibility
    altText?: string;
    autoPublish?: boolean;
    notifyDeviceIds?: string[];
    productTags?: Array<{
        platformProductId: string;
        productName: string;
        mediaIndex: number;
        positionX?: number;
        positionY?: number;
    }>;
}
