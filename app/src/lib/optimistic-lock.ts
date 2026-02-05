/**
 * Optimistic Locking Utilities
 * Prevents lost updates when multiple users edit the same resource.
 *
 * Why: Two admins editing organization settings simultaneously can overwrite
 * each other's changes. Optimistic locking detects conflicts and prompts users.
 */

import { logger } from '@/lib/logger';

/**
 * Result of an optimistic locking check.
 */
export interface OptimisticLockResult {
    success: boolean;
    conflictDetected: boolean;
    currentVersion?: string;
    error?: string;
}

/**
 * Check if the updatedAt timestamp matches before updating.
 * Uses updatedAt as a simple version field (works with all Prisma models).
 * Throws OptimisticLockError if timestamps don't match.
 *
 * @param table - Prisma model name (for logging)
 * @param recordId - ID of the record
 * @param expectedUpdatedAt - updatedAt the client has
 * @param currentUpdatedAt - Current updatedAt in database
 */
export function checkUpdatedAt(
    table: string,
    recordId: string,
    expectedUpdatedAt: Date | string,
    currentUpdatedAt: Date | string
): void {
    const expected = new Date(expectedUpdatedAt).getTime();
    const current = new Date(currentUpdatedAt).getTime();

    if (expected !== current) {
        logger.warn({
            table,
            recordId,
            expectedUpdatedAt,
            currentUpdatedAt,
        }, 'Optimistic lock conflict detected');

        throw new OptimisticLockError(
            `This ${table} was modified by another user. Please refresh and try again.`,
            currentUpdatedAt.toString()
        );
    }
}

/**
 * Wrap an update operation with optimistic locking check.
 * Uses updatedAt as the version field for simplicity.
 *
 * @param fetchCurrent - Function to get current record with updatedAt
 * @param expectedUpdatedAt - The updatedAt value the client expects
 * @param performUpdate - Function to perform the actual update
 * @param modelName - For error messages
 */
export async function withOptimisticLock<T>(
    modelName: string,
    recordId: string,
    expectedUpdatedAt: Date | string,
    fetchCurrent: () => Promise<{ updatedAt: Date } | null>,
    performUpdate: () => Promise<T>
): Promise<T> {
    const current = await fetchCurrent();

    if (!current) {
        throw new Error(`${modelName} not found`);
    }

    checkUpdatedAt(modelName, recordId, expectedUpdatedAt, current.updatedAt);

    return await performUpdate();
}

/**
 * Create a version token for client-side tracking.
 * Send this with edit requests and compare on save.
 */
export function createVersionToken(updatedAt: Date): string {
    return updatedAt.toISOString();
}

/**
 * Validate a version token before save.
 */
export function validateVersionToken(
    token: string,
    currentUpdatedAt: Date
): boolean {
    return token === currentUpdatedAt.toISOString();
}

/**
 * Custom error for optimistic locking conflicts.
 */
export class OptimisticLockError extends Error {
    public readonly currentVersion: string;

    constructor(message: string, currentVersion: string) {
        super(message);
        this.name = 'OptimisticLockError';
        this.currentVersion = currentVersion;
    }
}

/**
 * Check if an error is an optimistic lock conflict.
 */
export function isOptimisticLockError(error: unknown): error is OptimisticLockError {
    return error instanceof OptimisticLockError;
}
