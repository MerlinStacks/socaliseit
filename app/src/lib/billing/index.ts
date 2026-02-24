/**
 * Billing module barrel export
 *
 * Why: Clean import path — `import { checkFeatureGate, getPlanLimits } from '@/lib/billing'`
 */

export {
    getPlanLimits,
    getFeatureLimit,
    isFeatureEnabled,
    PLAN_LIMITS,
    PLAN_DISPLAY,
    type PlanLimits,
    type GatedFeature,
} from './plan-config';

export {
    checkFeatureGate,
    type GateResult,
} from './feature-gate';

export {
    invalidatePlanCache,
    loadPlanLimitsFromDb,
} from './plan-cache';
