/**
 * Session Validator
 * 
 * Server-side validation utilities for checking session integrity.
 * Handles edge cases like deleted users or invalidated sessions.
 * 
 * Why: Users can be deleted while logged in on another device,
 * or sessions can become stale during database migrations.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Validate that a user still exists in the database
 * 
 * @param userId - The user ID from the session
 * @returns true if user exists, false otherwise
 */
export async function validateUserExists(userId: string): Promise<boolean> {
    try {
        const user = await db.user.findUnique({
            where: { id: userId },
            select: { id: true },
        });
        return !!user;
    } catch (error) {
        // DB error - fail closed (assume invalid)
        logger.error({ err: error }, 'DB error checking user existence');
        return false;
    }
}

/**
 * Validate that a user has access to an organization
 * 
 * @param userId - The user ID from the session
 * @param organizationId - The organization ID to validate access to
 * @returns true if user is a member of the organization
 */
export async function validateOrgAccess(
    userId: string,
    organizationId: string
): Promise<boolean> {
    try {
        const membership = await db.organizationMember.findFirst({
            where: {
                userId,
                organizationId,
            },
            select: { id: true },
        });
        return !!membership;
    } catch (error) {
        logger.error({ err: error }, 'DB error checking org access');
        return false;
    }
}

/**
 * Validate session integrity - checks user exists and has org access
 * 
 * @param userId - The user ID from the session
 * @param organizationId - The current organization ID
 * @returns Object with validation status and reason if invalid
 */
export async function validateSession(
    userId: string,
    organizationId?: string
): Promise<{ valid: boolean; reason?: string }> {
    // Check user exists
    const userExists = await validateUserExists(userId);
    if (!userExists) {
        return { valid: false, reason: 'USER_DELETED' };
    }

    // Check org access if org is specified
    if (organizationId) {
        const hasAccess = await validateOrgAccess(userId, organizationId);
        if (!hasAccess) {
            return { valid: false, reason: 'ORG_ACCESS_REVOKED' };
        }
    }

    return { valid: true };
}

/**
 * Check if database schema has changed (migration detection)
 * 
 * @returns true if schema appears to be intact
 */
export async function checkSchemaHealth(): Promise<{ healthy: boolean; error?: string }> {
    try {
        // Simple query to verify database connectivity and schema
        await db.user.findFirst({ select: { id: true }, take: 1 });
        return { healthy: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { healthy: false, error: message };
    }
}
