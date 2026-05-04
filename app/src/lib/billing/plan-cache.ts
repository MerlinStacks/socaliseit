/**
 * Plan Cache — Server-side cache layer for plan configuration
 *
 * Why: Feature gates call getPlanLimits() on every request. Reading from
 * DB each time would be expensive, so we cache in memory and expose
 * an invalidation hook that the admin plans API calls after edits.
 */

import { db } from '@/lib/db';
import { PLAN_LIMITS, PLAN_DISPLAY, type PlanLimits } from './plan-config';
import { logger } from '@/lib/logger';

interface CachedPlanData {
    limits: Record<string, PlanLimits>;
    display: Record<string, { name: string; description: string; color: string }>;
    cachedAt: number;
}

let cache: CachedPlanData | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Invalidates the in-memory plan cache.
 * Why: Called by the admin plans API after a config update so
 * feature gates immediately pick up the new limits.
 */
export function invalidatePlanCache(): void {
    cache = null;
}

/**
 * Loads plan limits from DB with fallback to hardcoded defaults.
 * Why: Returns synchronously from cache when available. If cache
 * is stale or empty, refreshes from DB asynchronously.
 */
export async function loadPlanLimitsFromDb(tier: string): Promise<PlanLimits> {
    if (cache && Date.now() - cache.cachedAt < CACHE_TTL_MS) {
        return cache.limits[tier] ?? PLAN_LIMITS[tier as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.FREE;
    }

    try {
        const rows = await db.planConfig.findMany();

        if (rows.length === 0) {
            /* Why: No DB rows yet (pre-seed). Use hardcoded defaults and cache them. */
            cache = {
                limits: { ...PLAN_LIMITS },
                display: { ...PLAN_DISPLAY },
                cachedAt: Date.now(),
            };
            return PLAN_LIMITS[tier as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.FREE;
        }

        const limits: Record<string, PlanLimits> = { ...PLAN_LIMITS };
        const display: Record<string, { name: string; description: string; color: string }> = { ...PLAN_DISPLAY };

        for (const row of rows) {
            limits[row.tier] = {
                socialAccounts: row.socialAccounts === -1 ? Infinity : row.socialAccounts,
                teamMembers: row.teamMembers === -1 ? Infinity : row.teamMembers,
                scheduledPostsPerMonth: row.scheduledPostsPerMonth === -1 ? Infinity : row.scheduledPostsPerMonth,
                aiGenerationsPerMonth: row.aiGenerationsPerMonth === -1 ? Infinity : row.aiGenerationsPerMonth,
                competitorTracking: row.competitorTracking === -1 ? Infinity : row.competitorTracking,
                analyticsExport: row.analyticsExport,
                customBranding: row.customBranding,
                prioritySupport: row.prioritySupport,
            };
            display[row.tier] = {
                name: row.displayName,
                description: row.description,
                color: row.color,
            };
        }

        cache = { limits, display, cachedAt: Date.now() };
        return limits[tier] ?? PLAN_LIMITS.FREE;
    } catch (err) {
        logger.warn({ err }, '[plan-cache] Failed to load from DB, using hardcoded defaults');
        return PLAN_LIMITS[tier as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.FREE;
    }
}
