/**
 * Meta Webhook Auto-Registration
 *
 * Handles programmatic subscription to Meta's webhook system so operators
 * never have to manually copy URLs or tokens into the Meta Developer Console.
 *
 * Two levels of registration are required by Meta:
 *   1. App-level  — registers the callback URL + fields for the Meta App itself.
 *                   Done once when META credentials are saved in the Setup Wizard.
 *   2. Page-level — tells Meta that a specific Page/Instagram account wants to
 *                   receive those events. Done each time an account is connected.
 */

import { logger } from '@/lib/logger';

const GRAPH_API = 'https://graph.facebook.com/v24.0';

// Fields to subscribe to per platform object
const INSTAGRAM_FIELDS = ['messages', 'comments', 'mentions', 'story_insights'];
const FACEBOOK_FIELDS  = ['messages', 'feed', 'mention'];

// ─────────────────────────────────────────────────────────────────────────────
// App-level subscription
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the Meta app's webhook subscriptions for both Instagram and Facebook.
 * Called when META credentials are saved in the Setup Wizard.
 *
 * Why: Meta requires an app-level subscription that points to our callback URL
 * before any page-level events can be delivered. The app access token is formed
 * by joining appId and appSecret with a pipe — no OAuth flow needed.
 */
export async function registerMetaAppSubscriptions(
    appId: string,
    appSecret: string,
    verifyToken: string,
): Promise<{ success: boolean; errors: string[] }> {
    const appAccessToken = `${appId}|${appSecret}`;
    const baseUrl = (process.env.NEXTAUTH_URL || process.env.APP_URL || '').replace(/\/$/, '');

    if (!baseUrl) {
        logger.warn('NEXTAUTH_URL not set — cannot register Meta app subscriptions');
        return { success: false, errors: ['NEXTAUTH_URL environment variable is not set'] };
    }

    const errors: string[] = [];

    // Instagram subscription
    const igResult = await subscribeMetaApp({
        appId,
        appAccessToken,
        object: 'instagram',
        callbackUrl: `${baseUrl}/api/webhooks/instagram`,
        verifyToken,
        fields: INSTAGRAM_FIELDS,
    });
    if (!igResult.success) {
        errors.push(`Instagram app subscription: ${igResult.error}`);
        logger.warn({ error: igResult.error }, 'Meta Instagram app subscription failed');
    } else {
        logger.info('Meta Instagram app subscription registered');
    }

    // Facebook Page subscription
    const fbResult = await subscribeMetaApp({
        appId,
        appAccessToken,
        object: 'page',
        callbackUrl: `${baseUrl}/api/webhooks/facebook`,
        verifyToken,
        fields: FACEBOOK_FIELDS,
    });
    if (!fbResult.success) {
        errors.push(`Facebook app subscription: ${fbResult.error}`);
        logger.warn({ error: fbResult.error }, 'Meta Facebook app subscription failed');
    } else {
        logger.info('Meta Facebook app subscription registered');
    }

    return { success: errors.length === 0, errors };
}

async function subscribeMetaApp(params: {
    appId: string;
    appAccessToken: string;
    object: 'instagram' | 'page';
    callbackUrl: string;
    verifyToken: string;
    fields: string[];
}): Promise<{ success: boolean; error?: string }> {
    try {
        const body = new URLSearchParams({
            object: params.object,
            callback_url: params.callbackUrl,
            verify_token: params.verifyToken,
            fields: params.fields.join(','),
            access_token: params.appAccessToken,
        });

        const response = await fetch(`${GRAPH_API}/${params.appId}/subscriptions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        });

        const data = await response.json();

        if (!response.ok || data.success === false) {
            return { success: false, error: data.error?.message || `HTTP ${response.status}` };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page-level subscription
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Subscribe a specific Facebook Page or Instagram account to webhook events.
 * Called each time a Facebook or Instagram account is connected via the picker.
 *
 * Why: App-level subscription alone isn't enough — Meta also requires each Page
 * to explicitly opt in to receiving webhook notifications from the app.
 */
export async function registerMetaPageSubscription(
    pageId: string,
    pageAccessToken: string,
    platform: 'FACEBOOK' | 'INSTAGRAM',
): Promise<{ success: boolean; error?: string }> {
    try {
        const fields = platform === 'INSTAGRAM' ? INSTAGRAM_FIELDS : FACEBOOK_FIELDS;

        const response = await fetch(`${GRAPH_API}/${pageId}/subscribed_apps`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${pageAccessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ subscribed_fields: fields.join(',') }),
        });

        const data = await response.json();

        if (!response.ok || data.success === false) {
            return { success: false, error: data.error?.message || `HTTP ${response.status}` };
        }

        logger.info({ pageId, platform }, 'Meta page webhook subscription registered');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
