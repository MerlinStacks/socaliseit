/**
 * Webhooks API Route
 * Handle incoming webhooks from platforms and services
 *
 * Why: Meta/Shopify app secrets are stored encrypted in the GlobalPlatformCredential
 * table (configured via Setup Wizard), NOT in environment variables.
 * The verification function fetches them from DB at request time.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getCredentialsForPlatform } from '@/lib/platforms/credentials';
import type { WebhookType } from '@/lib/webhooks';
import type { Prisma } from '@/generated/prisma/client';
import { isRecord } from '@/lib/utils';
import crypto from 'crypto';

export const runtime = 'nodejs';

class InvalidWebhookSignature extends Error {}

// POST /api/webhooks/[platform] - Receive webhook
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ platform: string }> }
) {
    const { platform } = await params;

    // Get raw body for verification
    const rawBody = Buffer.from(await request.arrayBuffer());

    // Verify signature (async — reads secret from DB)
    try {
        await verifyWebhookSignature(platform, rawBody, request.headers);
    } catch (error) {
        if (!(error instanceof InvalidWebhookSignature)) {
            logger.error({ platform, code: isRecord(error) ? error.code : undefined }, 'Webhook verification unavailable');
            return NextResponse.json({ error: 'Webhook verification unavailable' }, { status: 503 });
        }
        logger.warn({ platform, error: error.message }, 'Webhook signature verification failed');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse payload
    let payload: unknown;
    try {
        payload = JSON.parse(rawBody.toString('utf8'));
    } catch (e) {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (!isRecord(payload)) {
        return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }

    logger.info({ platform, event: payload.object || payload.topic }, 'Received webhook');

    // Handle Meta verification challenge (sometimes sent in POST during setup)
    if (platform === 'instagram' || platform === 'facebook') {
        if (payload['hub.mode'] === 'subscribe' && typeof payload['hub.challenge'] === 'string') {
            return new NextResponse(payload['hub.challenge'], { status: 200 });
        }
    }

    const deliveries = splitWebhookDelivery(platform, payload);
    // Deduplicate identical deliveries even if the response to a committed
    // insert is lost and the provider retries.
    const data = deliveries.map(({ type, payload }) => ({
        id: crypto.createHash('sha256').update(type).update('\0').update(rawBody).digest('hex'),
        type,
        payload: payload as Prisma.InputJsonObject,
    }));
    try {
        await db.incomingWebhook.createMany({
            data,
            skipDuplicates: true,
        });
    } catch (err) {
        // Prisma validation errors can include the payload in the error text.
        logger.error({ platform, deliveryIds: data.map(row => row.id), code: isRecord(err) ? err.code : undefined }, 'Could not store incoming webhook');
        return NextResponse.json({ error: 'Webhook inbox unavailable' }, { status: 503 });
    }

    return NextResponse.json({ received: true });
}

/**
 * Split Meta envelopes by handler so each event type is processed and retried
 * independently. Keep account IDs and other entry metadata with each group.
 */
function splitWebhookDelivery(platform: string, payload: Record<string, unknown>): Array<{ type: WebhookType; payload: Record<string, unknown> }> {
    // Both Meta objects may be delivered to the same app callback URL.
    if (platform === 'instagram' || platform === 'facebook') {
        if (payload.object === 'instagram') platform = 'instagram';
        else if (payload.object === 'page') platform = 'facebook';
        const groups = new Map<WebhookType, Record<string, unknown>[]>();
        const add = (field: string, entry: Record<string, unknown>) => {
            const type = `${platform}.${field}` as WebhookType;
            const group = groups.get(type) ?? [];
            group.push(entry);
            groups.set(type, group);
        };
        for (const entry of Array.isArray(payload.entry) ? payload.entry.filter(isRecord) : []) {
            const { changes, messaging, ...metadata } = entry;
            if (Array.isArray(messaging) && messaging.length) add('message', { ...metadata, messaging });

            const byField = new Map<string, Record<string, unknown>[]>();
            for (const change of Array.isArray(changes) ? changes.filter(isRecord) : []) {
                if (typeof change.field !== 'string' || !change.field) continue;
                const field = change.field;
                const list = byField.get(field) ?? [];
                list.push(change);
                byField.set(field, list);
            }
            for (const [field, changes] of byField) add(field, { ...metadata, changes });
        }
        if (groups.size) return [...groups].map(([type, entry]) => ({ type, payload: { ...payload, entry } }));
    }

    return [{ type: `${platform}.${payload.object || payload.topic || 'event'}` as WebhookType, payload }];
}

/**
 * Resolve the HMAC secret for a platform from DB-stored credentials.
 * Why: Platform API credentials are managed via the Setup Wizard and stored
 * encrypted in GlobalPlatformCredential — not in environment variables.
 *
 * @returns The decrypted clientSecret, or null if not configured.
 */
async function resolveSecret(platform: string): Promise<string | null> {
    // Instagram and Facebook both use META credentials; the helper handles mapping.
    const creds = await getCredentialsForPlatform(platform as Parameters<typeof getCredentialsForPlatform>[0]);
    return creds?.clientSecret ?? null;
}

/**
 * Verify webhook signature based on platform.
 * Async because the signing secret is fetched from the database.
 */
async function verifyWebhookSignature(platform: string, rawBody: Buffer, headers: Headers) {
    const isProduction = process.env.NODE_ENV === 'production';

    switch (platform) {
        case 'instagram':
        case 'facebook': {
            const signature = headers.get('x-hub-signature-256');
            const secret = await resolveSecret(platform);

            // Why: Silently skipping verification in production allows forged payloads.
            if (!secret) {
                if (isProduction) throw new Error('META credentials not configured — add them via Setup Wizard');
                logger.warn('META credentials missing — skipping webhook verification (dev only)');
                return;
            }
            if (!signature) throw new InvalidWebhookSignature('Missing signature header');
            if (!rawBody.length) throw new InvalidWebhookSignature('Empty request body');
            if (!/^sha256=[a-fA-F0-9]{64}$/.test(signature)) throw new InvalidWebhookSignature('Malformed signature header');

            // Hash the received bytes directly; decoding/re-encoding can change them.
            const digest = 'sha256=' + crypto
                .createHmac('sha256', secret)
                .update(rawBody)
                .digest('hex');

            if (!crypto.timingSafeEqual(Buffer.from(signature.slice(7), 'hex'), Buffer.from(digest.slice(7), 'hex'))) {
                // Why: Log enough to diagnose whether the wrong app secret is stored
                // without leaking the full values.
                logger.warn({
                    platform,
                    bodyLength: rawBody.length,
                }, 'Webhook signature mismatch — verify the Meta App Secret in Setup Wizard matches the one in Meta Developer Console');
                throw new InvalidWebhookSignature('Signature mismatch');
            }
            break;
        }
        case 'shopify': {
            const signature = headers.get('x-shopify-hmac-sha256');
            // Why: Shopify doesn't have a credential entry in our globalPlatformCredential
            // table, so we still fall back to an env var for now.
            const secret = process.env.SHOPIFY_APP_SECRET;

            if (!secret) {
                if (isProduction) throw new Error('SHOPIFY_APP_SECRET not configured');
                logger.warn('SHOPIFY_APP_SECRET missing — skipping webhook verification (dev only)');
                return;
            }
            if (!signature) throw new InvalidWebhookSignature('Missing signature header');

            const hmac = crypto.createHmac('sha256', secret);
            const digest = hmac.update(rawBody).digest('base64');

            if (Buffer.byteLength(signature) !== Buffer.byteLength(digest) || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
                throw new InvalidWebhookSignature('Signature mismatch');
            }
            break;
        }
        // Why (BUG-02): Removed 'stripe' case — it only checked header presence without
        // verifying the actual signature. Stripe has a dedicated route at /api/webhooks/stripe
        // that correctly uses stripe.webhooks.constructEvent(). Routing Stripe through this
        // generic endpoint would bypass signature verification.
        default:
            // Unknown platform — reject in production, allow in dev for testing
            if (isProduction) {
                throw new InvalidWebhookSignature(`Unknown webhook platform: ${platform}`);
            }
            logger.warn({ platform }, 'Webhook from unknown platform — skipping verification (dev only)');
    }
}

// GET /api/webhooks/[platform] - Verify webhook (for Meta)
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ platform: string }> }
) {
    const { platform } = await params;
    const { searchParams } = new URL(request.url);

    // Meta verification
    if (platform === 'instagram' || platform === 'facebook') {
        const mode = searchParams.get('hub.mode');
        const challenge = searchParams.get('hub.challenge');
        const verifyToken = searchParams.get('hub.verify_token');

        if (mode === 'subscribe' && verifyToken) {
            // Look up token from global platform credentials (super admin configured)
            const credential = await db.globalPlatformCredential.findUnique({
                where: {
                    platform: 'META',
                },
            });

            if (credential && credential.webhookVerifyToken === verifyToken) {
                return new NextResponse(challenge, { status: 200 });
            }
        }

        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
