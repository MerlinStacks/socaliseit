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
            return await handleMetaComment(payload, 'INSTAGRAM');
        case 'facebook.comment':
        case 'facebook.feed':
            return await handleMetaComment(payload, 'FACEBOOK');
        case 'instagram.mention':
        case 'facebook.mention':
            return await handleMetaMention(payload);
        case 'instagram.message':
        case 'facebook.message':
            return await handleInstagramMessage(payload);
        default:
            return { success: true };
    }
}

/**
 * Handle incoming comment webhooks from Meta (Instagram or Facebook).
 *
 * Instagram payload (field: "comments"):
 * ```json
 * { "entry": [{ "id": "<IGSID>", "changes": [{ "field": "comments",
 *   "value": { "id": "<COMMENT_ID>", "text": "...", "timestamp": 1234,
 *     "media": { "id": "<MEDIA_ID>" },
 *     "from": { "id": "<USER_ID>", "username": "<USERNAME>" } } }] }] }
 * ```
 *
 * Facebook payload (field: "feed", item: "comment"):
 * ```json
 * { "entry": [{ "id": "<PAGE_ID>", "changes": [{ "field": "feed",
 *   "value": { "item": "comment", "comment_id": "<ID>", "message": "...",
 *     "post_id": "<POST_ID>", "created_time": 1234,
 *     "from": { "id": "<USER_ID>", "name": "<NAME>" } } }] }] }
 * ```
 */
async function handleMetaComment(
    payload: Record<string, unknown>,
    platform: 'INSTAGRAM' | 'FACEBOOK',
): Promise<{ success: boolean; action?: string }> {
    const entries = payload.entry as Record<string, unknown>[];
    if (!Array.isArray(entries) || entries.length === 0) return { success: true, action: 'no_entries' };

    // Why: Track saved count per org so we fire one notification per org after
    // ALL entries are processed — not after each entry with a cumulative count.
    const orgCounts = new Map<string, number>();

    for (const entry of entries) {
        const entryId = entry.id as string;
        const changes = entry.changes as Record<string, unknown>[];
        if (!Array.isArray(changes)) continue;

        // Find the social account this entry belongs to
        const socialAccount = await db.socialAccount.findFirst({
            where: { platformId: entryId, platform, isActive: true },
            select: { id: true, organizationId: true },
        });

        if (!socialAccount) {
            logger.warn({ entryId, platform }, 'No social account found for comment webhook entry');
            continue;
        }

        for (const change of changes) {
            const value = change.value as Record<string, unknown>;
            if (!value) continue;

            // Facebook feed webhooks include non-comment items (likes, posts, reactions) — skip them
            if (platform === 'FACEBOOK' && value.item !== 'comment') continue;

            // Extract fields from the platform-specific payload shape
            const commentId: string = platform === 'INSTAGRAM'
                ? (value.id as string)
                : (value.comment_id as string);
            const postId: string = platform === 'INSTAGRAM'
                ? ((value.media as Record<string, string>)?.id ?? '')
                : (value.post_id as string ?? '');
            const text: string = platform === 'INSTAGRAM'
                ? (value.text as string ?? '')
                : (value.message as string ?? '');
            const from = value.from as Record<string, string> | undefined;
            const authorId = from?.id || 'unknown';
            const authorUsername = from?.username ?? from?.name ?? authorId;
            const createdAt = value.timestamp
                ? new Date((value.timestamp as number) * 1000)
                : value.created_time
                    ? new Date((value.created_time as number) * 1000)
                    : new Date();

            if (!commentId || !postId) continue;

            try {
                await db.comment.upsert({
                    where: {
                        socialAccountId_platformCommentId: {
                            socialAccountId: socialAccount.id,
                            platformCommentId: commentId,
                        },
                    },
                    create: {
                        organizationId: socialAccount.organizationId,
                        socialAccountId: socialAccount.id,
                        platformPostId: postId,
                        platformCommentId: commentId,
                        authorId,
                        authorUsername,
                        text,
                        likeCount: 0,
                        replyCount: 0,
                        createdAt,
                    },
                    update: { text, syncedAt: new Date() },
                });
                orgCounts.set(
                    socialAccount.organizationId,
                    (orgCounts.get(socialAccount.organizationId) ?? 0) + 1
                );
            } catch (err) {
                logger.error({ err, commentId }, 'Failed to save comment from webhook');
            }
        }
    }

    const totalSaved = [...orgCounts.values()].reduce((a, b) => a + b, 0);

    // Fire one notification per org after all entries are processed
    for (const [organizationId, commentsAdded] of orgCounts) {
        import('@/lib/services/inbox-notifications').then(({ sendInboxNotifications }) =>
            sendInboxNotifications({ organizationId, commentsAdded, mentionsAdded: 0, dmsAdded: 0, reviewsAdded: 0 })
        ).catch((err) => logger.warn({ err }, 'Webhook comment notification failed'));
    }

    return { success: true, action: totalSaved > 0 ? `saved_${totalSaved}_comments` : 'no_comments_saved' };
}

/**
 * Handle incoming mention webhooks from Meta (Instagram or Facebook).
 *
 * Instagram payload (field: "mentions"):
 * ```json
 * { "entry": [{ "id": "<IGSID>", "changes": [{ "field": "mentions",
 *   "value": { "media_id": "<MEDIA_ID>", "comment_id": "<COMMENT_ID>" } }] }] }
 * ```
 */
async function handleMetaMention(
    payload: Record<string, unknown>,
): Promise<{ success: boolean; action?: string }> {
    const entries = payload.entry as Record<string, unknown>[];
    if (!Array.isArray(entries) || entries.length === 0) return { success: true, action: 'no_entries' };

    const platform = (payload.object as string)?.toUpperCase() === 'PAGE' ? 'FACEBOOK' : 'INSTAGRAM';
    // Why: Same as handleMetaComment — accumulate per-org counts and fire one notification
    // per org after ALL entries are processed.
    const orgCounts = new Map<string, number>();

    for (const entry of entries) {
        const entryId = entry.id as string;
        const changes = entry.changes as Record<string, unknown>[];
        if (!Array.isArray(changes)) continue;

        const socialAccount = await db.socialAccount.findFirst({
            where: { platformId: entryId, platform, isActive: true },
            select: { id: true, organizationId: true },
        });

        if (!socialAccount) {
            logger.warn({ entryId, platform }, 'No social account found for mention webhook entry');
            continue;
        }

        for (const change of changes) {
            const value = change.value as Record<string, unknown>;
            if (!value) continue;

            const postId = (value.media_id ?? value.post_id ?? value.comment_id) as string;
            if (!postId) continue;

            const mentionType = value.comment_id ? 'comment_mention' : 'media_mention';

            try {
                await db.mention.upsert({
                    where: {
                        socialAccountId_platformPostId_type: {
                            socialAccountId: socialAccount.id,
                            platformPostId: postId,
                            type: mentionType,
                        },
                    },
                    create: {
                        organizationId: socialAccount.organizationId,
                        socialAccountId: socialAccount.id,
                        platformPostId: postId,
                        type: mentionType,
                        // Why: Meta mention webhooks only include the media/comment ID —
                        // author info requires a separate API call. We store a placeholder
                        // here so the mention appears immediately; the polling sync
                        // (syncAccountMentions) will hydrate the full author details.
                        authorId: 'webhook-pending',
                        authorUsername: 'webhook-pending',
                        createdAt: new Date(),
                    },
                    update: {},
                });
                orgCounts.set(
                    socialAccount.organizationId,
                    (orgCounts.get(socialAccount.organizationId) ?? 0) + 1
                );
            } catch (err) {
                logger.error({ err, postId }, 'Failed to save mention from webhook');
            }
        }
    }

    const totalSaved = [...orgCounts.values()].reduce((a, b) => a + b, 0);

    // Fire one notification per org after all entries are processed
    for (const [organizationId, mentionsAdded] of orgCounts) {
        import('@/lib/services/inbox-notifications').then(({ sendInboxNotifications }) =>
            sendInboxNotifications({ organizationId, commentsAdded: 0, mentionsAdded, dmsAdded: 0, reviewsAdded: 0 })
        ).catch((err) => logger.warn({ err }, 'Webhook mention notification failed'));
    }

    return { success: true, action: totalSaved > 0 ? `saved_${totalSaved}_mentions` : 'no_mentions_saved' };
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
    const entries = payload.entry as Record<string, unknown>[];
    if (!Array.isArray(entries) || entries.length === 0) {
        logger.warn({ payload }, 'Instagram message webhook has no entries');
        return { success: false, action: 'no_entries' };
    }

    let savedCount = 0;

    for (const entry of entries) {
        const messagingEvents = entry.messaging as Record<string, unknown>[];
        if (!Array.isArray(messagingEvents)) continue;

        for (const event of messagingEvents) {
            const senderId: string | undefined = (event.sender as Record<string, string>)?.id;
            const recipientId: string | undefined = (event.recipient as Record<string, string>)?.id;
            const message = event.message as Record<string, unknown> | undefined;

            // Skip non-message events (e.g. read receipts, delivery confirmations)
            if (!message || !senderId || !recipientId) continue;

            const messageId: string = message.mid as string;
            const text: string | null = (message.text as string) ?? null;
            const timestamp = event.timestamp
                ? new Date((event.timestamp as number) * 1000)
                : new Date();

            // Determine attachment info if present
            const attachment = (message.attachments as Record<string, unknown>[])?.[0];
            const mediaUrl: string | null = (attachment?.payload as Record<string, string>)?.url ?? null;
            const mediaType: string | null = (attachment?.type as string) ?? null;

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
 * Get webhook logs from the database.
 * Why (BUG-47): Previously returned hardcoded mock data, making the
 * admin webhook log viewer useless in production.
 */
export async function getWebhookLogs(
    _organizationId: string,
    limit: number = 50
): Promise<WebhookEvent[]> {
    try {
        const events = await db.processedWebhookEvent.findMany({
            orderBy: { processedAt: 'desc' },
            take: limit,
        });

        return events.map(e => ({
            id: e.eventId,
            type: 'instagram.comment' as WebhookType, // Best-effort type since ProcessedWebhookEvent lacks type info
            platform: 'unknown',
            payload: {},
            processedAt: e.processedAt,
            status: 'processed' as const,
            createdAt: e.processedAt,
        }));
    } catch (error) {
        logger.warn({ error }, 'Failed to fetch webhook logs, returning empty list');
        return [];
    }
}
