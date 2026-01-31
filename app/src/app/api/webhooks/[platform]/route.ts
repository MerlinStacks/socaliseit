/**
 * Webhooks API Route
 * Receive incoming webhooks
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/webhooks/[platform] - Receive webhook
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ platform: string }> }
) {
    const { platform } = await params;

    // Get signature header based on platform
    let signature = '';
    switch (platform) {
        case 'instagram':
        case 'facebook':
            signature = request.headers.get('x-hub-signature-256') || '';
            break;
        case 'shopify':
            signature = request.headers.get('x-shopify-hmac-sha256') || '';
            break;
        case 'stripe':
            signature = request.headers.get('stripe-signature') || '';
            break;
    }

    // Get payload
    const payload = await request.json();

    // In production:
    // 1. Verify signature
    // 2. Look up workspace from webhook URL
    // 3. Process webhook
    // 4. Log event

    console.log(`Received webhook from ${platform}:`, payload, signature);

    // Handle Meta verification challenge
    if (platform === 'instagram' || platform === 'facebook') {
        if (payload['hub.mode'] === 'subscribe' && payload['hub.challenge']) {
            return new NextResponse(payload['hub.challenge'], { status: 200 });
        }
    }

    // Process webhook asynchronously
    // await processWebhook(platform, payload);

    return NextResponse.json({ received: true });
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

