/**
 * Permission-based Authorization Middleware
 * Enables granular RBAC for API routes and components.
 *
 * Why: Allows workspace owners to define custom roles with specific
 * permissions, enabling enterprise-grade access control.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { Role } from '@/generated/prisma/client';
import { logger } from '@/lib/logger';

// ============================================================================
// PERMISSION CONSTANTS
// ============================================================================

import { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, type PermissionCode } from './permissions';
export { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, type PermissionCode } from './permissions';

// ============================================================================
// PERMISSION CATEGORIES (for UI)
// ============================================================================

export const PERMISSION_CATEGORIES = [
    {
        id: 'posts',
        name: 'Content',
        description: 'Create, edit, and publish posts',
        permissions: [
            { code: PERMISSIONS.POSTS_CREATE, name: 'Create Posts', description: 'Create new posts and drafts' },
            { code: PERMISSIONS.POSTS_EDIT, name: 'Edit Posts', description: 'Modify existing posts' },
            { code: PERMISSIONS.POSTS_DELETE, name: 'Delete Posts', description: 'Remove posts permanently' },
            { code: PERMISSIONS.POSTS_PUBLISH, name: 'Publish Posts', description: 'Publish posts immediately' },
            { code: PERMISSIONS.POSTS_SCHEDULE, name: 'Schedule Posts', description: 'Schedule posts for later' },
        ],
    },
    {
        id: 'analytics',
        name: 'Analytics',
        description: 'View and export analytics data',
        permissions: [
            { code: PERMISSIONS.ANALYTICS_VIEW, name: 'View Analytics', description: 'Access analytics dashboards' },
            { code: PERMISSIONS.ANALYTICS_EXPORT, name: 'Export Analytics', description: 'Download analytics reports' },
            { code: PERMISSIONS.ANALYTICS_REPORTS, name: 'Manage Reports', description: 'Create scheduled reports' },
        ],
    },
    {
        id: 'team',
        name: 'Team',
        description: 'Manage team members and roles',
        permissions: [
            { code: PERMISSIONS.TEAM_VIEW, name: 'View Team', description: 'See team member list' },
            { code: PERMISSIONS.TEAM_INVITE, name: 'Invite Members', description: 'Send invitations to new members' },
            { code: PERMISSIONS.TEAM_MANAGE, name: 'Manage Roles', description: 'Change member roles' },
            { code: PERMISSIONS.TEAM_REMOVE, name: 'Remove Members', description: 'Remove members from workspace' },
        ],
    },
    {
        id: 'settings',
        name: 'Settings',
        description: 'Configure workspace settings',
        permissions: [
            { code: PERMISSIONS.SETTINGS_VIEW, name: 'View Settings', description: 'Access settings pages' },
            { code: PERMISSIONS.SETTINGS_EDIT, name: 'Edit Settings', description: 'Modify workspace settings' },
            { code: PERMISSIONS.SETTINGS_BILLING, name: 'Billing Access', description: 'Manage billing and subscriptions' },
        ],
    },
    {
        id: 'accounts',
        name: 'Social Accounts',
        description: 'Connect and manage social accounts',
        permissions: [
            { code: PERMISSIONS.ACCOUNTS_VIEW, name: 'View Accounts', description: 'See connected accounts' },
            { code: PERMISSIONS.ACCOUNTS_CONNECT, name: 'Connect Accounts', description: 'Add new social accounts' },
            { code: PERMISSIONS.ACCOUNTS_DISCONNECT, name: 'Disconnect Accounts', description: 'Remove social accounts' },
        ],
    },
    {
        id: 'media',
        name: 'Media Library',
        description: 'Upload and manage media assets',
        permissions: [
            { code: PERMISSIONS.MEDIA_VIEW, name: 'View Media', description: 'Browse media library' },
            { code: PERMISSIONS.MEDIA_UPLOAD, name: 'Upload Media', description: 'Add new media files' },
            { code: PERMISSIONS.MEDIA_DELETE, name: 'Delete Media', description: 'Remove media files' },
        ],
    },
    {
        id: 'automations',
        name: 'Automations',
        description: 'Configure automated actions',
        permissions: [
            { code: PERMISSIONS.AUTOMATIONS_VIEW, name: 'View Automations', description: 'See automation rules' },
            { code: PERMISSIONS.AUTOMATIONS_MANAGE, name: 'Manage Automations', description: 'Create and edit automations' },
        ],
    },
    {
        id: 'video',
        name: 'Video Editor',
        description: 'Create and render videos',
        permissions: [
            { code: PERMISSIONS.VIDEO_VIEW, name: 'View Projects', description: 'Browse video projects' },
            { code: PERMISSIONS.VIDEO_CREATE, name: 'Create Projects', description: 'Create new video projects' },
            { code: PERMISSIONS.VIDEO_RENDER, name: 'Render Videos', description: 'Export and render videos' },
        ],
    },
    {
        id: 'discovery',
        name: 'Discovery',
        description: 'UGC, trends, and social listening',
        permissions: [
            { code: PERMISSIONS.DISCOVERY_VIEW, name: 'View Discovery', description: 'Access discovery features' },
            { code: PERMISSIONS.DISCOVERY_MANAGE, name: 'Manage Discovery', description: 'Configure competitors and tracking' },
        ],
    },
];

// ============================================================================
// PERMISSION CHECKING
// ============================================================================

/**
 * Check if a workspace member has a specific permission.
 */
export async function hasPermission(
    organizationId: string,
    userId: string,
    permission: PermissionCode
): Promise<boolean> {
    try {
        const member = await db.organizationMember.findUnique({
            where: {
                organizationId_userId: { organizationId, userId },
            },
            include: {
                customRole: {
                    include: {
                        permissions: {
                            include: {
                                permission: true,
                            },
                        },
                    },
                },
            },
        });

        if (!member) {
            return false;
        }

        // For CUSTOM role, check the custom role permissions
        if (member.role === 'CUSTOM' && member.customRole) {
            return member.customRole.permissions.some((rp) => rp.permission.code === permission);
        }

        // For built-in roles, use the default permission mapping
        const rolePermissions = DEFAULT_ROLE_PERMISSIONS[member.role as Exclude<Role, 'CUSTOM'>];
        return rolePermissions?.includes(permission) ?? false;
    } catch (error) {
        logger.error({ error, organizationId, userId, permission }, 'Error checking permission');
        return false;
    }
}

/**
 * Get all permissions for a workspace member.
 */
export async function getMemberPermissions(
    organizationId: string,
    userId: string
): Promise<PermissionCode[]> {
    try {
        const member = await db.organizationMember.findUnique({
            where: {
                organizationId_userId: { organizationId, userId },
            },
            include: {
                customRole: {
                    include: {
                        permissions: {
                            include: {
                                permission: true,
                            },
                        },
                    },
                },
            },
        });

        if (!member) {
            return [];
        }

        // For CUSTOM role, return custom role permissions
        if (member.role === 'CUSTOM' && member.customRole) {
            return member.customRole.permissions.map((rp) => rp.permission.code as PermissionCode);
        }

        // For built-in roles, return default permissions
        return DEFAULT_ROLE_PERMISSIONS[member.role as Exclude<Role, 'CUSTOM'>] ?? [];
    } catch (error) {
        logger.error({ error, organizationId, userId }, 'Error getting member permissions');
        return [];
    }
}

// ============================================================================
// API ROUTE MIDDLEWARE
// ============================================================================

type ApiHandler = (
    request: NextRequest,
    context: { params: Promise<Record<string, string>> }
) => Promise<NextResponse>;

/**
 * Wrap an API route handler with permission checking.
 *
 * @example
 * export const POST = withPermission(PERMISSIONS.POSTS_PUBLISH, async (req, ctx) => {
 *   // Handler code - only runs if user has posts.publish permission
 * });
 */
export function withPermission(permission: PermissionCode, handler: ApiHandler): ApiHandler {
    return async (request: NextRequest, context: { params: Promise<Record<string, string>> }) => {
        try {
            const session = await auth();

            if (!session?.user?.id) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }

            // Extract organizationId from URL or body
            const url = new URL(request.url);
            let organizationId = url.searchParams.get('organizationId');

            if (!organizationId) {
                // Try to get from request body for POST/PUT/PATCH
                if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
                    try {
                        const body = await request.clone().json();
                        organizationId = body.organizationId;
                    } catch {
                        // Body might not be JSON
                    }
                }
            }

            if (!organizationId) {
                return NextResponse.json({ error: 'Workspace ID required' }, { status: 400 });
            }

            const hasAccess = await hasPermission(organizationId, session.user.id, permission);

            if (!hasAccess) {
                logger.warn(
                    { userId: session.user.id, organizationId, permission },
                    'Permission denied'
                );
                return NextResponse.json(
                    { error: 'You do not have permission to perform this action' },
                    { status: 403 }
                );
            }

            return handler(request, context);
        } catch (error) {
            logger.error({ error }, 'Error in permission middleware');
            return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
        }
    };
}

// ============================================================================
// REACT HOOK (Client-side)
// ============================================================================

/**
 * Permission check result for client components.
 * Use with the usePermissions hook from @/hooks/usePermissions
 */
export interface PermissionCheckResult {
    permissions: PermissionCode[];
    hasPermission: (permission: PermissionCode) => boolean;
    hasAnyPermission: (permissions: PermissionCode[]) => boolean;
    hasAllPermissions: (permissions: PermissionCode[]) => boolean;
    isLoading: boolean;
}
