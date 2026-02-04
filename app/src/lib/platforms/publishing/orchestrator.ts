/**
 * Platform Publishing Orchestrator
 * Why: Routes publish requests to platform-specific handlers.
 */

import type { PlatformAccount, PublishPayload, PublishResponse } from '../types';
import { publishToInstagram } from './instagram';
import { publishToFacebook } from './facebook';
import { publishToTikTok } from './tiktok';
import { publishToYouTube } from './youtube';
import { publishToPinterest } from './pinterest';
import { publishToLinkedIn } from './linkedin';
import { publishToBluesky } from './bluesky';
import { publishToGoogleBusiness } from './google-business';

/**
 * Publish content to a platform.
 * Routes to platform-specific implementation based on account type.
 */
export async function publishToPlatform(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    // Check if token is expired
    if (new Date() > account.tokenExpiresAt) {
        return {
            success: false,
            error: 'Access token expired',
            errorCode: 'TOKEN_EXPIRED',
        };
    }

    // Platform-specific publishing logic
    switch (account.platform) {
        case 'instagram':
            return publishToInstagram(account, payload);
        case 'tiktok':
            return publishToTikTok(account, payload);
        case 'youtube':
            return publishToYouTube(account, payload);
        case 'facebook':
            return publishToFacebook(account, payload);
        case 'pinterest':
            return publishToPinterest(account, payload);
        case 'linkedin':
            return publishToLinkedIn(account, payload);
        case 'bluesky':
            return publishToBluesky(account, payload);
        case 'google_business':
            return publishToGoogleBusiness(account, payload);
        default:
            return { success: false, error: 'Unsupported platform' };
    }
}
