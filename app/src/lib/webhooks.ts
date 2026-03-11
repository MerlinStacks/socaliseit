/**
 * Webhooks Service
 * Handle incoming webhooks from platforms and services
 */

import crypto from 'crypto';
import { logger } from './logger';
import { extractWebhookEventId, checkAndMarkWebhook } from './webhook-idempotency';

export type WebhookType =
    | 'instagram.comment'
    | 'instagram.mention'
    | 'tiktok.comment'
    | 'facebook.comment'
    | 'stripe.payment';

export interface WebhookEvent {
    id: string;
    type: WebhookType;
    platform: string;
    payload: Record<string, unknown>;
    processedAt?: Date;
    status: 'pending' | 'processed' | 'failed';
    error?: string;
    createdAt: Date;
}

export interface WebhookConfig {
    id: string;
    organizationId: string;
    type: WebhookType;
    url: string;
    secret: string;
    isActive: boolean;
    events: string[];
    createdAt: Date;
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string,
    platform: string
): boolean {
    // Platform-specific verification
    switch (platform) {
        case 'instagram':
        case 'facebook':
            // Meta uses SHA256 HMAC
            return verifyMetaSignature(payload, signature, secret);
        case 'stripe':
            // Stripe uses their own signature scheme
            return verifyStripeSignature(payload, signature, secret);
        default:
            return false;
    }
}



/**
 * Verify Meta (Facebook/Instagram) webhook signature.
 * Meta sends signature as 'sha256=HASH' in X-Hub-Signature-256 header.
 * 
 * @param payload - Raw request body string
 * @param signature - Signature from X-Hub-Signature-256 header
 * @param secret - App secret from Meta developer console
 */
function verifyMetaSignature(payload: string, signature: string, secret: string): boolean {
    if (!signature || !secret) {
        logger.warn('Missing signature or secret for Meta webhook verification');
        return false;
    }

    try {
        const expectedSignature = 'sha256=' + crypto
            .createHmac('sha256', secret)
            .update(payload, 'utf8')
            .digest('hex');

        // Use timing-safe comparison to prevent timing attacks
        const sigBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expectedSignature);

        if (sigBuffer.length !== expectedBuffer.length) {
            return false;
        }

        return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
    } catch (error) {
        logger.error({ error }, 'Error verifying Meta webhook signature');
        return false;
    }
}


/**
 * Verify Stripe webhook signature.
 * Stripe sends 't=timestamp,v1=signature' format in Stripe-Signature header.
 * 
 * @param payload - Raw request body string
 * @param signature - Signature from Stripe-Signature header
 * @param secret - Webhook signing secret from Stripe dashboard (whsec_...)
 */
function verifyStripeSignature(payload: string, signature: string, secret: string): boolean {
    if (!signature || !secret) {
        logger.warn('Missing signature or secret for Stripe webhook verification');
        return false;
    }

    try {
        // Parse Stripe signature format: t=timestamp,v1=signature
        const elements = signature.split(',');
        const timestampElement = elements.find(e => e.startsWith('t='));
        const signatureElement = elements.find(e => e.startsWith('v1='));

        if (!timestampElement || !signatureElement) {
            logger.warn('Invalid Stripe signature format');
            return false;
        }

        const timestamp = timestampElement.substring(2);
        const expectedSig = signatureElement.substring(3);

        // Verify timestamp is within tolerance (5 minutes)
        const tolerance = 300; // 5 minutes in seconds
        const currentTime = Math.floor(Date.now() / 1000);
        if (Math.abs(currentTime - parseInt(timestamp, 10)) > tolerance) {
            logger.warn('Stripe webhook timestamp outside tolerance window');
            return false;
        }

        // Compute expected signature
        const signedPayload = `${timestamp}.${payload}`;
        const computedSignature = crypto
            .createHmac('sha256', secret)
            .update(signedPayload, 'utf8')
            .digest('hex');

        // Use timing-safe comparison
        const sigBuffer = Buffer.from(expectedSig);
        const computedBuffer = Buffer.from(computedSignature);

        if (sigBuffer.length !== computedBuffer.length) {
            return false;
        }

        return crypto.timingSafeEqual(sigBuffer, computedBuffer);
    } catch (error) {
        logger.error({ error }, 'Error verifying Stripe webhook signature');
        return false;
    }
}

/**
 * Process incoming webhook
 */
export async function processWebhook(
    type: WebhookType,
    payload: Record<string, unknown>
): Promise<{ success: boolean; action?: string }> {
    // Extract platform from webhook type
    const platform = type.split('.')[0];

    // Idempotency check: prevent duplicate processing
    const eventId = extractWebhookEventId(platform, payload);
    if (eventId) {
        const isNew = await checkAndMarkWebhook(eventId);
        if (!isNew) {
            logger.info({ type, eventId }, 'Duplicate webhook skipped');
            return { success: true, action: 'duplicate_skipped' };
        }
    }

    logger.info({ type, payload, eventId }, 'Processing webhook');

    switch (type) {
        case 'instagram.comment':
            return await handleInstagramComment(payload);
        case 'instagram.mention':
            return await handleInstagramMention(payload);
        default:
            return { success: true };
    }
}

async function handleInstagramComment(payload: Record<string, unknown>): Promise<{ success: boolean; action?: string }> {
    // TODO (BUG-14): Implement Instagram comment auto-reply
    // Check if AI comment responder is enabled for the account
    // Generate and post response via Instagram Graph API
    logger.warn({ payload }, 'Instagram comment handler is a stub — no action taken');
    return { success: true, action: 'stub_no_action' };
}

async function handleInstagramMention(payload: Record<string, unknown>): Promise<{ success: boolean; action?: string }> {
    // TODO (BUG-14): Implement UGC discovery from Instagram mentions
    logger.warn({ payload }, 'Instagram mention handler is a stub — no action taken');
    return { success: true, action: 'stub_no_action' };
}



/**
 * Register webhook with platform
 */
export async function registerWebhook(
    organizationId: string,
    platform: string,
    events: string[]
): Promise<WebhookConfig> {
    const secret = generateWebhookSecret();

    const config: WebhookConfig = {
        id: `webhook_${Date.now()}`,
        organizationId,
        type: `${platform}.${events[0]}` as WebhookType,
        url: `${process.env.NEXTAUTH_URL}/api/webhooks/${organizationId}/${platform}`,
        secret,
        isActive: true,
        events,
        createdAt: new Date(),
    };

    // In production, register with platform API

    return config;
}

/**
 * Generate secure webhook secret
 */
function generateWebhookSecret(): string {
    return crypto.randomBytes(32).toString('base64url');
}

/**
 * Get webhook logs
 */
export async function getWebhookLogs(
    organizationId: string,
    limit: number = 50
): Promise<WebhookEvent[]> {
    // Mock data
    return [
        {
            id: 'event_1',
            type: 'instagram.comment',
            platform: 'instagram',
            payload: { text: 'Love this!', postId: 'post_123' },
            processedAt: new Date(),
            status: 'processed',
            createdAt: new Date(Date.now() - 3600 * 1000),
        },
        {
            id: 'event_2',
            type: 'facebook.comment',
            platform: 'facebook',
            payload: { text: 'Great content!', postId: 'fb_post_456' },
            processedAt: new Date(),
            status: 'processed',
            createdAt: new Date(Date.now() - 7200 * 1000),
        },
    ];
}
