/**
 * Audit Log Utility
 * Records admin actions for compliance and troubleshooting
 */

import { db } from '@/lib/db';
import type { NextRequest } from 'next/server';

interface AuditLogEntry {
    action: string;
    actorId: string;
    targetId?: string;
    targetType?: 'user' | 'organization' | 'organization' | 'settings';
    metadata?: Record<string, unknown>;
    request?: NextRequest;
}

/**
 * Records an admin action to the audit log.
 * 
 * Why: Tracks who did what and when for compliance, debugging, and security review.
 * This function should be called after successful admin operations.
 */
export async function recordAuditLog({
    action,
    actorId,
    targetId,
    targetType,
    metadata,
    request,
}: AuditLogEntry): Promise<void> {
    try {
        await db.auditLog.create({
            data: {
                action,
                actorId,
                targetId,
                targetType,
                metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
                ipAddress: request?.headers.get('x-forwarded-for')
                    || request?.headers.get('x-real-ip')
                    || undefined,
                userAgent: request?.headers.get('user-agent') || undefined,
            },
        });
    } catch (error) {
        // Log but don't throw - audit logging shouldn't break the main operation
        console.error('[AuditLog] Failed to record:', { action, actorId, error });
    }
}

/**
 * Common audit action constants for consistency
 */
export const AUDIT_ACTIONS = {
    // User management
    USER_PROMOTE_ADMIN: 'user.promote_admin',
    USER_REVOKE_ADMIN: 'user.revoke_admin',
    USER_UPDATE: 'user.update',

    // Impersonation
    IMPERSONATE_START: 'impersonate.start',
    IMPERSONATE_END: 'impersonate.end',

    // Organization management
    ORG_CREATE: 'organization.create',
    ORG_UPDATE: 'organization.update',
    ORG_DELETE: 'organization.delete',

    // Workspace management
    WORKSPACE_VIEW: 'organization.view',
    WORKSPACE_UPDATE: 'organization.update',

    // Platform settings
    SETTINGS_UPDATE: 'settings.update',
    SETTINGS_REGISTRATION_TOGGLE: 'settings.registration_toggle',
    SETTINGS_MAINTENANCE_TOGGLE: 'settings.maintenance_toggle',
} as const;
