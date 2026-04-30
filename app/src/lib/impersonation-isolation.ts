/**
 * Impersonation Session Isolation
 * Ensures impersonated sessions are isolated from the admin's own data.
 *
 * Why: When an admin impersonates a user, they should only see/modify
 * that user's data. Without isolation, admin actions could accidentally
 * affect their own account, or cached data could leak between sessions.
 */

import { headers } from 'next/headers';

/** Header name for impersonation context */
export const IMPERSONATION_HEADER = 'x-impersonating-user';
export const IMPERSONATION_ORG_HEADER = 'x-impersonating-org';

/**
 * Impersonation context from request headers.
 */
export interface ImpersonationContext {
    isImpersonating: boolean;
    impersonatedUserId?: string;
    impersonatedOrgId?: string;
    adminUserId?: string;
}

/**
 * Get impersonation context from request headers.
 * Server-side only.
 */
export async function getImpersonationContext(): Promise<ImpersonationContext> {
    const headersList = await headers();
    const impersonatedUserId = headersList.get(IMPERSONATION_HEADER);
    const impersonatedOrgId = headersList.get(IMPERSONATION_ORG_HEADER);

    return {
        isImpersonating: !!impersonatedUserId,
        impersonatedUserId: impersonatedUserId || undefined,
        impersonatedOrgId: impersonatedOrgId || undefined,
    };
}

/**
 * Create a cache key that includes impersonation context.
 * Prevents cache pollution between impersonation sessions.
 *
 * @param baseKey - Original cache key
 * @param impersonatedUserId - Impersonated user ID (if any)
 */
export function getIsolatedCacheKey(baseKey: string, impersonatedUserId?: string): string {
    if (impersonatedUserId) {
        return `impersonate:${impersonatedUserId}:${baseKey}`;
    }
    return baseKey;
}

/**
 * Create React Query key with impersonation isolation.
 * Use this for all queries that could be affected by impersonation.
 *
 * @param queryKey - Base query key array
 * @param impersonatedUserId - Impersonated user ID (if any)
 */
export function getIsolatedQueryKey(
    queryKey: (string | number | undefined)[],
    impersonatedUserId?: string
): (string | number | undefined)[] {
    if (impersonatedUserId) {
        return ['impersonated', impersonatedUserId, ...queryKey];
    }
    return queryKey;
}

/**
 * Check if an operation is allowed during impersonation.
 * Some operations should be blocked when impersonating.
 */
export function isOperationAllowedDuringImpersonation(
    operation: 'read' | 'write' | 'delete' | 'billing' | 'settings'
): boolean {
    // During impersonation, restrict destructive or sensitive operations
    const restrictedOperations = ['billing', 'settings'];
    return !restrictedOperations.includes(operation);
}

/**
 * Validate that an API request is properly scoped for impersonation.
 * Returns an error message if validation fails.
 *
 * @param requestedOrgId - Organization ID in the request
 * @param impersonationContext - Current impersonation context
 */
export function validateImpersonationScope(
    requestedOrgId: string,
    impersonationContext: ImpersonationContext
): { valid: boolean; error?: string } {
    // If not impersonating, allow all
    if (!impersonationContext.isImpersonating) {
        return { valid: true };
    }

    // When impersonating, must match impersonated org
    if (impersonationContext.impersonatedOrgId && requestedOrgId !== impersonationContext.impersonatedOrgId) {
        return {
            valid: false,
            error: 'Cannot access this organization while impersonating another user',
        };
    }

    return { valid: true };
}

/**
 * Clear impersonation-related caches.
 * Call this when starting or ending impersonation.
 */
export function clearImpersonationCaches(): void {
    // Client-side only
    if (typeof window === 'undefined') return;

    // Clear sessionStorage items related to impersonation
    try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key?.startsWith('impersonate:')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => sessionStorage.removeItem(key));
    } catch {
        // Ignore storage errors (private mode)
    }
}
