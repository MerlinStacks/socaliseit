/**
 * Webhooks API Route
 * Receive incoming webhooks
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import crypto from 'node:crypto';

// POST /api/webhooks/[platform] - Receive webhook
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ platform: string }> }
) {
    const { platform } = await params;

    // Get raw body for verification
    const rawBody = await request.text();

    // Verify signature
    try {
        verifyWebhookSignature(platform, rawBody, request.headers);
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
 * Verify webhook signature based on platform
 */
function verifyWebhookSignature(platform: string, rawBody: string, headers: Headers) {
    // Skip verification if secret is missing (e.g. invalid dev setup)
    // In strict production, this should throw

    switch (platform) {
        case 'instagram':
        case 'facebook': {
            const signature = headers.get('x-hub-signature-256');
            const secret = process.env.META_APP_SECRET;

            if (!secret) return; // Cannot verify without secret
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
            const secret = process.env.SHOPIFY_APP_SECRET;

            if (!secret) return;
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
            // Look up token from database - find any workspace with matching token
            const credential = await db.platformCredential.findFirst({
                where: {
                    platform: 'META',
                    webhookVerifyToken: verifyToken,
                },
            });

            if (credential) {
                return new NextResponse(challenge, { status: 200 });
            }
        }

        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

