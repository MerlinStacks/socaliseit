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
import { processWebhook, type WebhookType } from '@/lib/webhooks';
import crypto from 'node:crypto';

// POST /api/webhooks/[platform] - Receive webhook
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ platform: string }> }
) {
    const { platform } = await params;

    // Get raw body for verification
    const rawBody = await request.text();

    // Verify signature (async — reads secret from DB)
    try {
        await verifyWebhookSignature(platform, rawBody, request.headers);
    } catch (error) {
        logger.warn({ platform, error: (error as Error).message }, 'Webhook signature verification failed');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse payload
    let payload;
    try {
        payload = JSON.parse(rawBody);
    } catch (e) {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    logger.info({ platform, event: payload.object || payload.topic }, 'Received webhook');

    // Handle Meta verification challenge (sometimes sent in POST during setup)
    if (platform === 'instagram' || platform === 'facebook') {
        if (payload['hub.mode'] === 'subscribe' && payload['hub.challenge']) {
            return new NextResponse(payload['hub.challenge'], { status: 200 });
        }
    }

    // Why (BUG-04): Previously commented out — all webhooks were acknowledged
    // but silently dropped. This broke Instagram auto-reply, UGC discovery, and
    // Shopify conversion tracking. Process asynchronously to avoid blocking the response.
    //
    // Why: Meta messaging webhooks (DMs) use `entry[].messaging` instead of
    // `entry[].changes`. Detecting this structure lets us route to the correct
    // handler rather than falling through as 'instagram.instagram'.
    const webhookType = resolveWebhookType(platform, payload);
    processWebhook(webhookType, payload).catch((err) => {
        logger.error({ err, platform }, 'Async webhook processing failed');
    });

    return NextResponse.json({ received: true });
}

/**
 * Determine the correct webhook type from the platform and payload.
 *
 * Why: Meta uses two different payload shapes:
 *   - `entry[].changes[]` for comment/mention/story events
 *   - `entry[].messaging[]` for DMs (Instagram Messaging API)
 * Previously everything was concatenated as `platform.object` which produced
 * 'instagram.instagram' for DMs — unmatched by any handler.
 */
function resolveWebhookType(platform: string, payload: Record<string, unknown>): WebhookType {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry = (payload.entry as any[])?.[0];

    if ((platform === 'instagram' || platform === 'facebook') && entry) {
        // DM webhook: entry contains `messaging` array
        if (Array.isArray(entry.messaging) && entry.messaging.length > 0) {
            return `${platform}.message` as WebhookType;
        }

        // Changes-based webhook: entry contains `changes` array with a field identifier
        const change = entry.changes?.[0];
        if (change?.field) {
            // e.g. 'comments', 'mentions', 'story_insights'
            return `${platform}.${change.field}` as WebhookType;
        }
    }

    // Fallback for all other platforms or unrecognised Meta payloads
    return `${platform}.${payload.object || payload.topic || 'event'}` as WebhookType;
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
async function verifyWebhookSignature(platform: string, rawBody: string, headers: Headers) {
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
            if (!signature) throw new Error('Missing signature header');
            if (!rawBody) throw new Error('Empty request body');

            // Why: Explicit 'utf8' encoding prevents any implicit conversion that
            // could alter the byte sequence and produce a different digest.
            const digest = 'sha256=' + crypto
                .createHmac('sha256', secret)
                .update(rawBody, 'utf8')
                .digest('hex');

            logger.debug({
                platform,
                signatureHeader: signature,
                expectedDigest: digest,
                bodyLength: rawBody.length,
                secretTail: secret.slice(-4),
            }, 'Webhook signature debug');

            if (signature.length !== digest.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
                throw new Error('Signature mismatch');
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
            if (!signature) throw new Error('Missing signature header');

            const hmac = crypto.createHmac('sha256', secret);
            const digest = hmac.update(rawBody).digest('base64');

            if (signature.length !== digest.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
                throw new Error('Signature mismatch');
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
                throw new Error(`Unknown webhook platform: ${platform}`);
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

