/**
 * Stripe SDK re-exports
 *
 * Why: This file is kept as a thin re-export layer for backward compatibility.
 * All config resolution (DB → env-var fallback) lives in stripe-config.ts.
 * Consumers that previously imported { stripe, isStripeConfigured } from
 * '@/lib/stripe' will continue to work, but the functions are now async.
 */

export {
    getStripeInstance,
    isStripeConfigured,
    getStripeConfig,
    invalidateStripeConfigCache,
} from './stripe-config';
