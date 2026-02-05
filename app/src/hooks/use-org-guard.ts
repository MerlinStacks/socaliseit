/**
 * Organization Guard Hook
 * 
 * Client-side validation for organization context.
 * Prevents edge cases where user switches orgs mid-action.
 * 
 * Why: A user could create a draft for Org A, switch to Org B,
 * then attempt to save - this would create data in the wrong org.
 */

'use client';

import { useSession } from 'next-auth/react';
import { useWorkspace } from '@/hooks/use-workspace';
import { useCallback, useMemo } from 'react';

interface OrgGuardResult {
    /** Current org ID is valid for the user */
    isValid: boolean;
    /** Current org ID doesn't match any of user's orgs */
    hasMismatch: boolean;
    /** Current organization info */
    currentOrg: { id: string; name: string } | null;
    /** List of user's accessible organizations */
    userOrgs: Array<{ id: string; name: string }>;
    /** Validate that a target org matches current context */
    validateBeforeSave: (targetOrgId: string) => { valid: boolean; error?: string };
    /** Validate org context hasn't changed during an operation */
    validateOrgContext: (expectedOrgId: string) => boolean;
}

/**
 * Hook for validating organization context before save operations
 * 
 * @returns Organization validation utilities
 */
export function useOrgGuard(): OrgGuardResult {
    const { data: session } = useSession();
    const { organization } = useWorkspace();

    const currentOrgId = organization?.id;
    const userOrgs = session?.user?.organizations || [];

    const isValid = useMemo(() => {
        if (!currentOrgId) return false;
        return userOrgs.some(o => o.id === currentOrgId);
    }, [currentOrgId, userOrgs]);

    const hasMismatch = useMemo(() => {
        return !!currentOrgId && !isValid;
    }, [currentOrgId, isValid]);

    const currentOrg = useMemo(() => {
        if (!currentOrgId) return null;
        const org = userOrgs.find(o => o.id === currentOrgId);
        return org ? { id: org.id, name: org.name } : null;
    }, [currentOrgId, userOrgs]);

    /**
     * Validate before saving to ensure org context hasn't changed
     */
    const validateBeforeSave = useCallback((targetOrgId: string) => {
        // Check if user has access to target org
        const hasAccess = userOrgs.some(o => o.id === targetOrgId);
        if (!hasAccess) {
            return {
                valid: false,
                error: 'You no longer have access to this organization'
            };
        }

        // Warn if saving to different org than current
        if (targetOrgId !== currentOrgId) {
            return {
                valid: false,
                error: 'Organization context has changed. Please refresh the page.'
            };
        }

        return { valid: true };
    }, [currentOrgId, userOrgs]);

    /**
     * Check if current org context matches expected
     */
    const validateOrgContext = useCallback((expectedOrgId: string) => {
        return currentOrgId === expectedOrgId;
    }, [currentOrgId]);

    return {
        isValid,
        hasMismatch,
        currentOrg,
        userOrgs: userOrgs.map(o => ({ id: o.id, name: o.name })),
        validateBeforeSave,
        validateOrgContext,
    };
}
