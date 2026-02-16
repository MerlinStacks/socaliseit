/**
 * Webhook Idempotency Store
 * Prevents duplicate webhook processing using Redis-based event ID tracking.
 *
 * Why: Platform webhooks can be replayed (accidental or malicious) or delivered
 * out-of-order. Processing the same event twice could result in duplicate
 * actions (e.g., double-posting AI responses, duplicate UGC entries).
 */

import { getRedisConnection } from '@/lib/bullmq/connection';
import { logger } from '@/lib/logger';

/** TTL for processed webhook IDs (24 hours) */
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

/** Key prefix for webhook idempotency */
const IDEMPOTENCY_PREFIX = 'webhook-processed:';

/**
 * Extract a unique event ID from a webhook payload.
 * Different platforms use different ID formats.
 *
 * @param platform - The source platform
 * @param payload - The webhook payload
 * @returns Unique event ID or null if not extractable
 */
export function extractWebhookEventId(
    platform: string,
    payload: Record<string, unknown>
): string | null {
    try {
        switch (platform) {
            case 'instagram':
            case 'facebook': {
                // Meta uses entry[].id or entry[].changes[].value.id
                const entry = (payload.entry as Array<Record<string, unknown>>)?.[0];
                if (entry?.id) {
                    // Combine entry ID with timestamp for uniqueness
                    const time = entry.time || Date.now();
                    return `meta:${entry.id}:${time}`;
                }
                // Fallback to changes ID
                const changes = (entry?.changes as Array<Record<string, unknown>>)?.[0];
                const value = changes?.value as Record<string, unknown>;
                if (value?.id) {
                    return `meta:${value.id}`;
                }
                break;
            }

            case 'tiktok': {
                // TikTok uses event_id in payload
                if (payload.event_id) {
                    return `tiktok:${payload.event_id}`;
                }
                break;
            }

            case 'shopify': {
                // Shopify uses X-Shopify-Webhook-Id header (passed in payload)
                if (payload.webhook_id) {
                    return `shopify:${payload.webhook_id}`;
                }
                // Fallback to order/product ID + updated_at
                if (payload.id && payload.updated_at) {
                    return `shopify:${payload.id}:${payload.updated_at}`;
                }
                break;
            }

            case 'stripe': {
                // Stripe uses id field in event object
                if (payload.id) {
                    return `stripe:${payload.id}`;
                }
                break;
            }

            default:
                break;
        }

        // Generic fallback: hash the payload
        const hash = hashPayload(JSON.stringify(payload));
        return `generic:${platform}:${hash}`;
    } catch (error) {
        logger.error({ platform, error }, 'Failed to extract webhook event ID');
        return null;
    }
}

/**
 * Check if a webhook event has already been processed.
 *
 * @param eventId - The unique event ID
 * @returns true if already processed, false if new
 */
export async function isWebhookProcessed(eventId: string): Promise<boolean> {
    const redis = getRedisConnection();
    const key = `${IDEMPOTENCY_PREFIX}${eventId}`;

    try {
        const exists = await redis.exists(key);
        return exists === 1;
    } catch (error) {
        logger.error({ eventId, error }, 'Failed to check webhook idempotency');
        // Fail-open: allow processing to avoid missing legitimate events
        return false;
    }
}

/**
 * Mark a webhook event as processed.
 *
 * @param eventId - The unique event ID
 */
export async function markWebhookProcessed(eventId: string): Promise<void> {
    const redis = getRedisConnection();
    const key = `${IDEMPOTENCY_PREFIX}${eventId}`;

    try {
        await redis.setex(key, IDEMPOTENCY_TTL_SECONDS, Date.now().toString());
        logger.debug({ eventId }, 'Webhook marked as processed');
    } catch (error) {
        logger.error({ eventId, error }, 'Failed to mark webhook as processed');
        // Non-fatal: worst case is duplicate processing
    }
}

/**
 * Check and mark a webhook in one atomic operation.
 * Returns true if the event should be processed (is new).
 *
 * @param eventId - The unique event ID
 * @returns true if new (should process), false if duplicate (skip)
 */
export async function checkAndMarkWebhook(eventId: string): Promise<boolean> {
    const redis = getRedisConnection();
    const key = `${IDEMPOTENCY_PREFIX}${eventId}`;

    try {
        // SET NX with expiry - atomic check-and-set
        const result = await redis.set(
            key,
            Date.now().toString(),
            'EX',
            IDEMPOTENCY_TTL_SECONDS,
            'NX'
        );

        if (result === 'OK') {
            logger.debug({ eventId }, 'New webhook event, will process');
            return true;
        }

        logger.info({ eventId }, 'Duplicate webhook event, skipping');
        return false;
    } catch (error) {
        logger.error({ eventId, error }, 'Failed atomic webhook check');
        // Fail-open: allow processing
        return true;
    }
}

/**
 * Generates a SHA-256 hash for fallback event ID generation.
 * Why: The previous simpleHash used a 32-bit integer with ~50% collision
 * chance at 77K events (birthday paradox). SHA-256 is collision-proof
 * for practical purposes.
 */
function hashPayload(str: string): string {
    const { createHash } = require('node:crypto');
    return createHash('sha256').update(str).digest('hex');
}
