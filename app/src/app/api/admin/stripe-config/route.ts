/**
 * Admin Stripe Config API
 *
 * Why: Allows super admins to manage Stripe API keys, price IDs,
 * and checkout settings via the admin UI instead of environment variables.
 * Secrets are encrypted at rest using AES-256-GCM (lib/crypto.ts).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { safeParseJson } from '@/lib/utils';
import { encrypt, maskSecret } from '@/lib/crypto';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';
import { recordAuditLog, AUDIT_ACTIONS } from '@/lib/admin/audit';
import { invalidateStripeConfigCache } from '@/lib/stripe-config';
import Stripe from 'stripe';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const SINGLETON_ID = 'global_integration_settings';

/** Validate Stripe key format (sk_test_*, sk_live_*, pk_test_*, pk_live_*) */
function isValidStripeKey(key: string, prefix: 'sk' | 'pk'): boolean {
    return key.startsWith(`${prefix}_test_`) || key.startsWith(`${prefix}_live_`);
}

/**
 * GET — Return current Stripe config with secrets masked.
 * Why: Admin UI needs to show which keys are configured without exposing them.
 */
export const GET = withSuperAdmin(async () => {
    const settings = await db.globalIntegrationSettings.findUnique({
        where: { id: SINGLETON_ID },
    });

    if (!settings || !settings.stripeConfigured) {
        return NextResponse.json({
            configured: false,
            secretKeyMasked: '',
            publishableKey: '',
            webhookSecretMasked: '',
            proPriceId: '',
            businessPriceId: '',
            enterprisePriceId: '',
            trialDays: 0,
        });
    }

    return NextResponse.json({
        configured: true,
        secretKeyMasked: settings.stripeSecretKey
            ? maskSecret(settings.stripeSecretKey)
            : '',
        publishableKey: settings.stripePublishableKey || '',
        webhookSecretMasked: settings.stripeWebhookSecret
            ? maskSecret(settings.stripeWebhookSecret)
            : '',
        proPriceId: settings.stripeProPriceId || '',
        businessPriceId: settings.stripeBusinessPriceId || '',
        enterprisePriceId: settings.stripeEnterprisePriceId || '',
        trialDays: settings.stripeTrialDays ?? 0,
    });
});

/**
 * PUT — Upsert Stripe config. Encrypts secret key and webhook secret.
 * Why: Sensitive keys must never be stored plaintext in the database.
 */
export const PUT = withSuperAdmin(async (request: NextRequest, admin: AdminContext) => {
    const parseResult = await safeParseJson(request);
    if (!parseResult.ok) {
        return NextResponse.json({ error: parseResult.error }, { status: 400 });
    }
    const body = parseResult.data;
    const {
        secretKey,
        publishableKey,
        webhookSecret,
        proPriceId,
        businessPriceId,
        enterprisePriceId,
        trialDays,
    } = body;

    // Validate required fields
    if (!secretKey?.trim() && !publishableKey?.trim()) {
        // If neither key is provided, check if we're updating an existing config
        const existing = await db.globalIntegrationSettings.findUnique({
            where: { id: SINGLETON_ID },
        });
        if (!existing?.stripeConfigured) {
            return NextResponse.json(
                { error: 'At minimum, a Secret Key is required for new configurations' },
                { status: 400 }
            );
        }
    }

    // Validate key formats when provided
    if (secretKey?.trim() && !isValidStripeKey(secretKey.trim(), 'sk')) {
        return NextResponse.json(
            { error: 'Secret Key must start with sk_test_ or sk_live_' },
            { status: 400 }
        );
    }
    if (publishableKey?.trim() && !isValidStripeKey(publishableKey.trim(), 'pk')) {
        return NextResponse.json(
            { error: 'Publishable Key must start with pk_test_ or pk_live_' },
            { status: 400 }
        );
    }

    // Build update data — only change fields that were provided
    const existing = await db.globalIntegrationSettings.findUnique({
        where: { id: SINGLETON_ID },
    });

    const updateData: Record<string, unknown> = {
        stripeConfigured: true,
    };

    // Why: Only re-encrypt if a new value is provided, otherwise keep existing
    if (secretKey?.trim()) {
        updateData.stripeSecretKey = encrypt(secretKey.trim());
    } else if (existing?.stripeSecretKey) {
        updateData.stripeSecretKey = existing.stripeSecretKey;
    }

    if (publishableKey?.trim()) {
        updateData.stripePublishableKey = publishableKey.trim();
    }

    if (webhookSecret?.trim()) {
        updateData.stripeWebhookSecret = encrypt(webhookSecret.trim());
    } else if (existing?.stripeWebhookSecret) {
        updateData.stripeWebhookSecret = existing.stripeWebhookSecret;
    }

    // Price IDs are not secrets — store plaintext
    if (proPriceId !== undefined) updateData.stripeProPriceId = proPriceId.trim() || null;
    if (businessPriceId !== undefined) updateData.stripeBusinessPriceId = businessPriceId.trim() || null;
    if (enterprisePriceId !== undefined) updateData.stripeEnterprisePriceId = enterprisePriceId.trim() || null;

    if (trialDays !== undefined) {
        const days = parseInt(String(trialDays), 10);
        updateData.stripeTrialDays = isNaN(days) ? 0 : Math.max(0, days);
    }

    const result = await db.globalIntegrationSettings.upsert({
        where: { id: SINGLETON_ID },
        update: updateData,
        create: {
            id: SINGLETON_ID,
            ...updateData,
        },
    });

    // Why: Bust cache so next billing call picks up new keys immediately
    invalidateStripeConfigCache();

    await recordAuditLog({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        actorId: admin.userId,
        targetType: 'global_integration_settings',
        targetId: result.id,
        metadata: { action: 'upsert' },
        request,
    });

    return NextResponse.json({ success: true });
});

/**
 * DELETE — Clear all Stripe configuration.
 * Why: Admin must be able to fully remove Stripe integration.
 */
export const DELETE = withSuperAdmin(async (request: NextRequest, admin: AdminContext) => {
    await db.globalIntegrationSettings.upsert({
        where: { id: SINGLETON_ID },
        update: {
            stripeSecretKey: null,
            stripePublishableKey: null,
            stripeWebhookSecret: null,
            stripeProPriceId: null,
            stripeBusinessPriceId: null,
            stripeEnterprisePriceId: null,
            stripeTrialDays: 0,
            stripeConfigured: false,
        },
        create: { id: SINGLETON_ID },
    });

    invalidateStripeConfigCache();

    await recordAuditLog({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        actorId: admin.userId,
        targetType: 'global_integration_settings',
        targetId: SINGLETON_ID,
        metadata: { action: 'delete' },
        request,
    });

    return NextResponse.json({ success: true });
});

/**
 * POST — Test Stripe connection with the current secret key.
 * Why: Admin should be able to verify keys work before relying on them.
 */
export const POST = withSuperAdmin(async (request: NextRequest) => {
    const parseResult = await safeParseJson(request);
    if (!parseResult.ok) {
        return NextResponse.json({ error: parseResult.error }, { status: 400 });
    }
    const body = parseResult.data;
    const { secretKey } = body;

    if (!secretKey?.trim()) {
        return NextResponse.json(
            { error: 'Secret Key is required for connection test' },
            { status: 400 }
        );
    }

    if (!isValidStripeKey(secretKey.trim(), 'sk')) {
        return NextResponse.json(
            { error: 'Secret Key must start with sk_test_ or sk_live_' },
            { status: 400 }
        );
    }

    try {
        const testStripe = new Stripe(secretKey.trim());
        const balance = await testStripe.balance.retrieve();

        return NextResponse.json({
            success: true,
            mode: secretKey.trim().startsWith('sk_live_') ? 'live' : 'test',
            currency: balance.available?.[0]?.currency?.toUpperCase() || 'N/A',
        });
    } catch (err) {
        logger.error({ err }, '[admin/stripe-config] Connection test failed');
        return NextResponse.json(
            { error: 'Connection test failed — check your secret key' },
            { status: 400 }
        );
    }
});
