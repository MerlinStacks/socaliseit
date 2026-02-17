/**
 * Server-side cache utilities
 * Wraps Next.js `unstable_cache` with org-scoped tags for dashboard and analytics.
 *
 * Why: DB queries on dashboard (5) and analytics (8+) pages are expensive.
 * Caching with short TTLs + tag-based invalidation on post mutations makes
 * repeat loads near-instant while keeping data fresh when it actually changes.
 */

import { unstable_cache } from 'next/cache';
import { revalidateTag } from 'next/cache';
import { logger } from '@/lib/logger';

/** TTL constants in seconds */
const DASHBOARD_TTL = 120;   // 2 minutes
const ANALYTICS_TTL = 300;   // 5 minutes

/**
 * Creates org-scoped cache tags for the dashboard.
 * Why: Tag per org ensures invalidation only affects the relevant org's data.
 */
export function dashboardTags(organizationId: string): string[] {
    return [`dashboard-${organizationId}`, `posts-${organizationId}`];
}

/**
 * Creates org-scoped cache tags for analytics.
 */
export function analyticsTags(organizationId: string): string[] {
    return [`analytics-${organizationId}`, `posts-${organizationId}`];
}

/**
 * Wraps an async data-fetching function with `unstable_cache`.
 * Provides a consistent pattern for all cached server queries.
 *
 * @param fn - The async function to cache
 * @param keyParts - Static cache key segments (e.g., ['dashboard', orgId])
 * @param tags - Cache tags for invalidation
 * @param revalidate - TTL in seconds
 */
export function cachedQuery<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    keyParts: string[],
    tags: string[],
    revalidate: number,
): (...args: TArgs) => Promise<TResult> {
    return unstable_cache(fn, keyParts, { tags, revalidate });
}

/**
 * Invalidates all post-related caches for an organization.
 * Call this after any post create, update, delete, or publish.
 *
 * Why: Uses `posts-{orgId}` tag which is shared by both dashboard and
 * analytics caches, so a single call invalidates everything.
 */
export function invalidatePostCaches(organizationId: string): void {
    try {
        revalidateTag(`posts-${organizationId}`, 'max');
    } catch (error) {
        logger.error({ organizationId, error }, 'Failed to invalidate post caches');
    }
}

export { DASHBOARD_TTL, ANALYTICS_TTL };
