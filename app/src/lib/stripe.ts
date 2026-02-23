/**
 * Stripe SDK singleton
 *
 * Why: Centralizes Stripe client initialization and validates
 * that the secret key is present at boot time rather than
 * failing silently at first API call.
 */

import Stripe from 'stripe';
import { logger } from './logger';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
    logger.warn('[stripe] STRIPE_SECRET_KEY is not set — billing features will be disabled');
}

/**
 * Singleton Stripe client instance.
 * Uses API version 2025-03-31.basil (Stripe Node SDK v18+).
 */
export const stripe = STRIPE_SECRET_KEY
    ? new Stripe(STRIPE_SECRET_KEY)
    : (null as unknown as Stripe);

/**
 * Whether Stripe billing is configured and available.
 * Why: Guards all billing routes so they 503 gracefully if keys are missing.
 */
export function isStripeConfigured(): boolean {
    return !!STRIPE_SECRET_KEY;
}
