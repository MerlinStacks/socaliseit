/**
 * usePermissions Hook
 * React hook for checking user permissions in client components.
 *
 * Why: Enables permission-based UI rendering without exposing
 * server-side logic to the client.
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useWorkspace } from './use-workspace';
import type { PermissionCode, PermissionCheckResult } from '@/lib/auth/with-permission';

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function usePermissions(): PermissionCheckResult {
    const { data: session } = useSession();
    const { workspace } = useWorkspace();
    const [permissions, setPermissions] = useState<PermissionCode[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function fetchPermissions() {
            if (!session?.user?.id || !workspace?.id) {
                setPermissions([]);
                setIsLoading(false);
                return;
            }

            try {
                const response = await fetch(
                    `/api/team/permissions?workspaceId=${workspace.id}`
                );

                if (response.ok) {
                    const data = await response.json();
                    setPermissions(data.permissions || []);
                } else {
                    setPermissions([]);
                }
            } catch (error) {
                console.error('Failed to fetch permissions:', error);
                setPermissions([]);
            } finally {
                setIsLoading(false);
            }
        }

        fetchPermissions();
    }, [session?.user?.id, workspace?.id]);

    const hasPermission = useCallback(
        (permission: PermissionCode): boolean => {
            return permissions.includes(permission);
        },
        [permissions]
    );

    const hasAnyPermission = useCallback(
        (requiredPermissions: PermissionCode[]): boolean => {
            return requiredPermissions.some((p) => permissions.includes(p));
        },
        [permissions]
    );

    const hasAllPermissions = useCallback(
        (requiredPermissions: PermissionCode[]): boolean => {
            return requiredPermissions.every((p) => permissions.includes(p));
        },
        [permissions]
    );

    return useMemo(
        () => ({
            permissions,
            hasPermission,
            hasAnyPermission,
            hasAllPermissions,
            isLoading,
        }),
        [permissions, hasPermission, hasAnyPermission, hasAllPermissions, isLoading]
    );
}

// ============================================================================
// PERMISSION GATE COMPONENT
// ============================================================================

interface PermissionGateProps {
    permission: PermissionCode | PermissionCode[];
    mode?: 'any' | 'all';
    fallback?: React.ReactNode;
    children: React.ReactNode;
}

/**
 * Conditionally render children based on user permissions.
 *
 * @example
 * <PermissionGate permission="posts.publish">
 *   <PublishButton />
 * </PermissionGate>
 *
 * @example
 * <PermissionGate permission={['posts.create', 'posts.edit']} mode="any">
 *   <EditPanel />
 * </PermissionGate>
 */
export function PermissionGate({
    permission,
    mode = 'any',
    fallback = null,
    children,
}: PermissionGateProps) {
    const { hasPermission, hasAnyPermission, hasAllPermissions, isLoading } =
        usePermissions();

    if (isLoading) {
        return null; // Or a skeleton loader
    }

    const permissionArray = Array.isArray(permission) ? permission : [permission];

    const hasAccess =
        mode === 'all'
            ? hasAllPermissions(permissionArray)
            : permissionArray.length === 1
                ? hasPermission(permissionArray[0])
                : hasAnyPermission(permissionArray);

    if (!hasAccess) {
        return <>{ fallback } </>;
    }

    return <>{ children } </>;
}

// ============================================================================
// UTILITY HOOKS
// ============================================================================

/**
 * Check if user can perform a specific action.
 * Returns a boolean for simple conditional rendering.
 */
export function useCanPerform(permission: PermissionCode): boolean {
    const { hasPermission, isLoading } = usePermissions();

    if (isLoading) {
        return false; // Safe default while loading
    }

    return hasPermission(permission);
}

/**
 * Check if user has any of the specified permissions.
 */
export function useCanPerformAny(permissions: PermissionCode[]): boolean {
    const { hasAnyPermission, isLoading } = usePermissions();

    if (isLoading) {
        return false;
    }

    return hasAnyPermission(permissions);
}
