/**
 * Team Collaboration Service
 * Manage team members, roles, and permissions
 */

import { logger } from './logger';

export type Role = 'owner' | 'admin' | 'editor' | 'viewer';

export interface TeamMember {
    id: string;
    workspaceId: string;
    userId: string;
    email: string;
    name: string;
    avatar?: string;
    role: Role;
    permissions: Permission[];
    invitedAt: Date;
    acceptedAt?: Date;
    lastActiveAt?: Date;
    status: 'pending' | 'active' | 'suspended';
}

export type Permission =
    | 'posts.create'
    | 'posts.edit'
    | 'posts.delete'
    | 'posts.publish'
    | 'posts.approve'
    | 'media.upload'
    | 'media.delete'
    | 'analytics.view'
    | 'revenue.view'
    | 'settings.edit'
    | 'team.manage'
    | 'automations.manage'
    | 'accounts.connect';

// Role permission mappings
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
    owner: [
        'posts.create', 'posts.edit', 'posts.delete', 'posts.publish', 'posts.approve',
        'media.upload', 'media.delete',
        'analytics.view', 'revenue.view',
        'settings.edit', 'team.manage', 'automations.manage', 'accounts.connect',
    ],
    admin: [
        'posts.create', 'posts.edit', 'posts.delete', 'posts.publish', 'posts.approve',
        'media.upload', 'media.delete',
        'analytics.view', 'revenue.view',
        'settings.edit', 'team.manage', 'automations.manage', 'accounts.connect',
    ],
    editor: [
        'posts.create', 'posts.edit',
        'media.upload',
        'analytics.view',
    ],
    viewer: [
        'analytics.view',
    ],
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
    owner: 'Full access. Can delete workspace and transfer ownership.',
    admin: 'Full access except deleting workspace or transferring ownership.',
    editor: 'Can create and edit posts, upload media, and view analytics.',
    viewer: 'Read-only access to analytics and content.',
};

/**
 * Invite team member
 */
export async function inviteTeamMember(
    workspaceId: string,
    email: string,
    role: Role,
    invitedBy: string
): Promise<TeamMember> {
    const member: TeamMember = {
        id: `member_${Date.now()}`,
        workspaceId,
        userId: '', // Set when user accepts
        email,
        name: email.split('@')[0],
        role,
        permissions: ROLE_PERMISSIONS[role],
        invitedAt: new Date(),
        status: 'pending',
    };

    // TODO: In production:
    // 1. Save to database
    // 2. Send invitation email
    // 3. Log activity
    logger.debug({ workspaceId, email, role }, 'Invited team member');

    return member;
}

/**
 * Accept invitation
 */
export async function acceptInvitation(
    inviteToken: string,
    userId: string
): Promise<TeamMember> {
    // In production, verify token and update member

    return {
        id: 'member_1',
        workspaceId: 'ws_1',
        userId,
        email: 'user@example.com',
        name: 'New Member',
        role: 'editor',
        permissions: ROLE_PERMISSIONS.editor,
        invitedAt: new Date(),
        acceptedAt: new Date(),
        status: 'active',
    };
}

/**
 * Update member role
 */
export async function updateMemberRole(
    memberId: string,
    newRole: Role
): Promise<TeamMember> {
    // In production, update database

    return {
        id: memberId,
        role: newRole,
        permissions: ROLE_PERMISSIONS[newRole],
    } as TeamMember;
}

/**
 * Remove team member
 */
export async function removeMember(
    workspaceId: string,
    memberId: string
): Promise<{ success: boolean }> {
    // In production, remove from database

    return { success: true };
}

/**
 * Get team members
 */
export async function getTeamMembers(
    workspaceId: string
): Promise<TeamMember[]> {
    // Mock data
    return [
        {
            id: 'member_1',
            workspaceId,
            userId: 'user_1',
            email: 'owner@company.com',
            name: 'John Doe',
            role: 'owner',
            permissions: ROLE_PERMISSIONS.owner,
            invitedAt: new Date('2023-01-01'),
            acceptedAt: new Date('2023-01-01'),
            lastActiveAt: new Date(),
            status: 'active',
        },
        {
            id: 'member_2',
            workspaceId,
            userId: 'user_2',
            email: 'jane@company.com',
            name: 'Jane Smith',
            role: 'admin',
            permissions: ROLE_PERMISSIONS.admin,
            invitedAt: new Date('2023-06-15'),
            acceptedAt: new Date('2023-06-15'),
            lastActiveAt: new Date(Date.now() - 3600 * 1000),
            status: 'active',
        },
        {
            id: 'member_3',
            workspaceId,
            userId: '',
            email: 'marketing@company.com',
            name: 'marketing',
            role: 'editor',
            permissions: ROLE_PERMISSIONS.editor,
            invitedAt: new Date(Date.now() - 86400 * 1000),
            status: 'pending',
        },
    ];
}

/**
 * Check permission
 */
export function hasPermission(
    member: TeamMember,
    permission: Permission
): boolean {
    return member.permissions.includes(permission);
}

/**
 * Check if user can perform action
 */
export async function checkPermission(
    workspaceId: string,
    userId: string,
    permission: Permission
): Promise<boolean> {
    // In production, fetch member and check

    return true;
}

/**
 * Transfer workspace ownership
 */
export async function transferOwnership(
    workspaceId: string,
    currentOwnerId: string,
    newOwnerId: string
): Promise<{ success: boolean }> {
    // In production:
    // 1. Verify current user is owner
    // 2. Update roles
    // 3. Log activity

    return { success: true };
}

/**
 * Resend invitation
 */
export async function resendInvitation(
    memberId: string
): Promise<{ success: boolean }> {
    // In production, resend email

    return { success: true };
}
