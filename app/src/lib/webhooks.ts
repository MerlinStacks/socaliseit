/**
 * Webhooks Service
 * Handle incoming webhooks from platforms and services
 */

import crypto from 'crypto';
import { logger } from './logger';
import { db } from './db';
import { extractWebhookEventId, checkAndMarkWebhook } from './webhook-idempotency';

export type WebhookType =
    | 'instagram.comment'
    | 'instagram.comments'
    | 'instagram.mention'
    | 'instagram.message'
    | 'facebook.message'
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
        case 'instagram.comments':
            return await handleInstagramComment(payload);
        case 'instagram.mention':
            return await handleInstagramMention(payload);
        case 'instagram.message':
        case 'facebook.message':
            return await handleInstagramMessage(payload);
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
 * Handle incoming Instagram/Facebook direct messages from Meta webhook.
 *
 * Why: Meta sends DM webhooks in this structure:
 * ```json
 * {
 *   "object": "instagram",
 *   "entry": [{
 *     "id": "<PAGE_OR_IGSID>",
 *     "time": 1234567890,
 *     "messaging": [{
 *       "sender": { "id": "<SENDER_IGSID>" },
 *       "recipient": { "id": "<RECIPIENT_IGSID>" },
 *       "timestamp": 1234567890,
 *       "message": {
 *         "mid": "<MESSAGE_ID>",
 *         "text": "Hello!",
 *         "attachments": [{ "type": "image", "payload": { "url": "..." } }]
 *       }
 *     }]
 *   }]
 * }
 * ```
 * We match the recipient ID to a SocialAccount.platformId to find which
 * org the DM belongs to.
 */
async function handleInstagramMessage(
    payload: Record<string, unknown>
): Promise<{ success: boolean; action?: string }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries = payload.entry as any[];
    if (!Array.isArray(entries) || entries.length === 0) {
        logger.warn({ payload }, 'Instagram message webhook has no entries');
        return { success: false, action: 'no_entries' };
    }

    let savedCount = 0;

    for (const entry of entries) {
        const messagingEvents = entry.messaging as any[];
        if (!Array.isArray(messagingEvents)) continue;

        for (const event of messagingEvents) {
            const senderId: string | undefined = event.sender?.id;
            const recipientId: string | undefined = event.recipient?.id;
            const message = event.message;

            // Skip non-message events (e.g. read receipts, delivery confirmations)
            if (!message || !senderId || !recipientId) continue;

            const messageId: string = message.mid;
            const text: string | null = message.text ?? null;
            const timestamp = event.timestamp
                ? new Date(event.timestamp * 1000)
                : new Date();

            // Determine attachment info if present
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const attachment = (message.attachments as any[])?.[0];
            const mediaUrl: string | null = attachment?.payload?.url ?? null;
            const mediaType: string | null = attachment?.type ?? null;

            // Why: The recipient ID matches the Instagram Scoped User ID (IGSID)
            // of our connected SocialAccount. We look up by platformId.
            const socialAccount = await db.socialAccount.findFirst({
                where: {
                    platformId: recipientId,
                    platform: { in: ['INSTAGRAM', 'FACEBOOK', 'META'] },
                    isActive: true,
                },
                select: {
                    id: true,
                    organizationId: true,
                    platformId: true,
                },
            });

            if (!socialAccount) {
                logger.warn(
                    { recipientId, senderId, messageId },
                    'No social account found for Instagram DM recipient'
                );
                continue;
            }

            // Why: Instagram DMs don't have a dedicated conversationId in the
            // webhook payload. We derive one from the two participant IDs,
            // sorted for consistency regardless of message direction.
            const conversationId = [senderId, recipientId].sort().join(':');

            // Why: Determine if this is an inbound message (from a customer)
            // or outbound (sent by us through the API).
            const direction = senderId === socialAccount.platformId
                ? 'outbound'
                : 'inbound';

            try {
                await db.directMessage.upsert({
                    where: {
                        socialAccountId_platformMessageId: {
                            socialAccountId: socialAccount.id,
                            platformMessageId: messageId,
                        },
                    },
                    create: {
                        organizationId: socialAccount.organizationId,
                        socialAccountId: socialAccount.id,
                        conversationId,
                        platformMessageId: messageId,
                        direction,
                        senderId,
                        senderUsername: senderId, // Placeholder — profile lookup requires extra API call
                        text,
                        mediaUrl,
                        mediaType,
                        isRead: direction === 'outbound',
                        createdAt: timestamp,
                    },
                    update: {},
                });

                savedCount++;

                logger.info(
                    { messageId, conversationId, direction, orgId: socialAccount.organizationId },
                    'Saved Instagram direct message'
                );
            } catch (error) {
                logger.error(
                    { error, messageId, senderId, recipientId },
                    'Failed to save Instagram direct message'
                );
            }
        }
    }

    return {
        success: savedCount > 0,
        action: savedCount > 0 ? `saved_${savedCount}_messages` : 'no_messages_saved',
    };
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
