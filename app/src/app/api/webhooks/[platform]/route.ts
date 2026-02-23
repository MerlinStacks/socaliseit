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

    // Process webhook asynchronously
    // await processWebhook(platform, payload);

    return NextResponse.json({ received: true });
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

            const hmac = crypto.createHmac('sha256', secret);
            const digest = 'sha256=' + hmac.update(rawBody).digest('hex');

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
        case 'stripe': {
            const signature = headers.get('stripe-signature');
            const secret = process.env.STRIPE_WEBHOOK_SECRET;
            // Stripe verification is complex (timestamped), usually strictly requires stripe-node SDK
            // For now we check presence
            if (!secret && isProduction) throw new Error('STRIPE_WEBHOOK_SECRET not configured');
            if (secret && !signature) throw new Error('Missing signature header');
            break;
        }
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

