/**
 * Stripe Configuration Helper
 *
 * Why: Loads Stripe config from the database (GlobalIntegrationSettings)
 * with a 60-second in-memory cache. Falls back to env vars if DB config
 * is empty, ensuring zero breakage on deploy before admin enters keys.
 */

import Stripe from 'stripe';
import { db } from './db';
import { decrypt } from './crypto';
import { logger } from './logger';

interface StripeConfig {
    secretKey: string;
    publishableKey: string;
    webhookSecret: string;
    proPriceId: string;
    businessPriceId: string;
    enterprisePriceId: string;
    trialDays: number;
}

// Why: 60s cache avoids a DB query on every billing API call
const CACHE_TTL_MS = 60_000;
let cachedConfig: StripeConfig | null = null;
let cacheTimestamp = 0;
let cachedStripeInstance: Stripe | null = null;

/**
 * Bust the in-memory cache after admin saves new config.
 * Why: Ensures the next billing call picks up fresh keys immediately.
 */
export function invalidateStripeConfigCache(): void {
    cachedConfig = null;
    cacheTimestamp = 0;
    cachedStripeInstance = null;
}

/**
 * Safely decrypt a value, returning empty string on failure.
 * Why: A corrupt/missing encrypted value shouldn't crash the entire config load.
 */
function safeDecrypt(value: string | null | undefined): string {
    if (!value) return '';
    try {
        return decrypt(value);
    } catch (err) {
        logger.error({ err }, '[stripe-config] Failed to decrypt value');
        return '';
    }
}

/**
 * Load Stripe configuration from DB, falling back to env vars.
 * Results are cached for 60 seconds to avoid repeated DB queries.
 */
export async function getStripeConfig(): Promise<StripeConfig> {
    const now = Date.now();
    if (cachedConfig && now - cacheTimestamp < CACHE_TTL_MS) {
        return cachedConfig;
    }

    try {
        const settings = await db.globalIntegrationSettings.findUnique({
            where: { id: 'global_integration_settings' },
        });

        if (settings?.stripeConfigured) {
            cachedConfig = {
                secretKey: safeDecrypt(settings.stripeSecretKey),
                publishableKey: settings.stripePublishableKey || '',
                webhookSecret: safeDecrypt(settings.stripeWebhookSecret),
                proPriceId: settings.stripeProPriceId || '',
                businessPriceId: settings.stripeBusinessPriceId || '',
                enterprisePriceId: settings.stripeEnterprisePriceId || '',
                trialDays: settings.stripeTrialDays ?? 0,
            };
            cacheTimestamp = now;
            return cachedConfig;
        }
    } catch (err) {
        logger.error({ err }, '[stripe-config] Failed to load config from DB, falling back to env vars');
    }

    // Why: Env-var fallback ensures existing deployments keep working
    cachedConfig = {
        secretKey: process.env.STRIPE_SECRET_KEY || '',
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
        proPriceId: process.env.STRIPE_PRO_PRICE_ID || '',
        businessPriceId: process.env.STRIPE_BUSINESS_PRICE_ID || '',
        enterprisePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || '',
        trialDays: parseInt(process.env.STRIPE_TRIAL_DAYS || '0', 10),
    };
    cacheTimestamp = now;
    return cachedConfig;
}

/**
 * Returns a ready-to-use Stripe SDK instance using the resolved secret key.
 * Why: Consumers shouldn't need to know where the key comes from.
 */
export async function getStripeInstance(): Promise<Stripe> {
    if (cachedStripeInstance && cachedConfig && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
        return cachedStripeInstance;
    }

    const config = await getStripeConfig();
    if (!config.secretKey) {
        throw new Error('Stripe secret key is not configured');
    }

    cachedStripeInstance = new Stripe(config.secretKey);
    return cachedStripeInstance;
}

/**
 * Whether Stripe billing is configured and available.
 * Why: Guards all billing routes so they 503 gracefully if keys are missing.
 */
export async function isStripeConfigured(): Promise<boolean> {
    const config = await getStripeConfig();
    return !!config.secretKey;
}
