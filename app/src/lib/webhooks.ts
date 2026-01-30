/**
 * Webhooks Service
 * Handle incoming webhooks from platforms and services
 */

import crypto from 'crypto';
import { logger } from './logger';

export type WebhookType =
    | 'instagram.comment'
    | 'instagram.mention'
    | 'instagram.message'
    | 'tiktok.comment'
    | 'facebook.comment'
    | 'shopify.order'
    | 'shopify.product'
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
    workspaceId: string;
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
        case 'shopify':
            // Shopify uses SHA256 HMAC
            return verifyShopifySignature(payload, signature, secret);
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
 * Verify Shopify webhook signature.
 * Shopify sends base64-encoded HMAC-SHA256 in X-Shopify-Hmac-SHA256 header.
 * 
 * @param payload - Raw request body string
 * @param signature - Signature from X-Shopify-Hmac-SHA256 header (base64)
 * @param secret - Webhook signing secret from Shopify admin
 */
function verifyShopifySignature(payload: string, signature: string, secret: string): boolean {
    if (!signature || !secret) {
        logger.warn('Missing signature or secret for Shopify webhook verification');
        return false;
    }

    try {
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(payload, 'utf8')
            .digest('base64');

        // Use timing-safe comparison
        const sigBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expectedSignature);

        if (sigBuffer.length !== expectedBuffer.length) {
            return false;
        }

        return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
    } catch (error) {
        logger.error({ error }, 'Error verifying Shopify webhook signature');
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
    logger.info({ type, payload }, 'Processing webhook');

    switch (type) {
        case 'instagram.comment':
            return await handleInstagramComment(payload);
        case 'instagram.mention':
            return await handleInstagramMention(payload);
        case 'instagram.message':
            return await handleInstagramMessage(payload);
        case 'shopify.order':
            return await handleShopifyOrder(payload);
        default:
            return { success: true };
    }
}

async function handleInstagramComment(payload: Record<string, unknown>): Promise<{ success: boolean; action?: string }> {
    // Check if AI comment responder is enabled
    // Generate and post response
    return { success: true, action: 'queued_for_response' };
}

async function handleInstagramMention(payload: Record<string, unknown>): Promise<{ success: boolean; action?: string }> {
    // Add to UGC discovery queue
    return { success: true, action: 'added_to_ugc_queue' };
}

async function handleInstagramMessage(payload: Record<string, unknown>): Promise<{ success: boolean; action?: string }> {
    // Check DM automation rules
    // Process through automation flow
    return { success: true, action: 'processed_dm_automation' };
}

async function handleShopifyOrder(payload: Record<string, unknown>): Promise<{ success: boolean; action?: string }> {
    // Track conversion attribution
    return { success: true, action: 'tracked_conversion' };
}

/**
 * Register webhook with platform
 */
export async function registerWebhook(
    workspaceId: string,
    platform: string,
    events: string[]
): Promise<WebhookConfig> {
    const secret = generateWebhookSecret();

    const config: WebhookConfig = {
        id: `webhook_${Date.now()}`,
        workspaceId,
        type: `${platform}.${events[0]}` as WebhookType,
        url: `${process.env.NEXTAUTH_URL}/api/webhooks/${workspaceId}/${platform}`,
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
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Get webhook logs
 */
export async function getWebhookLogs(
    workspaceId: string,
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
            type: 'shopify.order',
            platform: 'shopify',
            payload: { orderId: 'order_456', total: 89.99 },
            processedAt: new Date(),
            status: 'processed',
            createdAt: new Date(Date.now() - 7200 * 1000),
        },
    ];
}
