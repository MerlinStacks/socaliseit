/**
 * Platform Resource Validators
 * 
 * Validates external platform resources like Pinterest boards and
 * Google Business locations before publishing.
 * 
 * Why: Posts can fail at publish time if the target resource no longer
 * exists (board deleted, location suspended). Pre-validation catches this early.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface PlatformValidationResult {
    valid: boolean;
    error?: string;
    warning?: string;
}

/**
 * Validate Pinterest board still exists and is accessible
 * 
 * @param boardId - Pinterest board ID
 * @param socialAccountId - Social account ID to use for API auth
 * @returns Validation result
 */
export async function validatePinterestBoard(
    boardId: string,
    socialAccountId: string
): Promise<PlatformValidationResult> {
    try {
        // Get account credentials
        const account = await db.socialAccount.findUnique({
            where: { id: socialAccountId },
            select: { accessToken: true, platform: true },
        });

        if (!account || account.platform !== 'PINTEREST') {
            return { valid: false, error: 'Pinterest account not found or invalid' };
        }

        // Check if we have a Late.dev proxy configured
        const lateApiUrl = process.env.LATE_DEV_API_URL;
        if (!lateApiUrl) {
            logger.warn('LATE_DEV_API_URL not configured, skipping Pinterest validation');
            return { valid: true, warning: 'Board validation skipped - API proxy not configured' };
        }

        // Call Pinterest API via Late.dev proxy
        const response = await fetch(`${lateApiUrl}/pinterest/boards/${boardId}`, {
            headers: {
                'Authorization': `Bearer ${account.accessToken}`,
            },
        });

        if (response.status === 404) {
            return { valid: false, error: 'Board no longer exists or was deleted' };
        }

        if (response.status === 401) {
            return { valid: false, error: 'Pinterest access has expired. Please reconnect your account.' };
        }

        if (!response.ok) {
            logger.warn({ status: response.status, boardId }, 'Pinterest board validation failed');
            return { valid: true, warning: 'Could not verify board exists' };
        }

        return { valid: true };
    } catch (error) {
        logger.error({ error, boardId }, 'Pinterest board validation error');
        return { valid: true, warning: 'Could not verify board - network error' };
    }
}

/**
 * Validate Google Business location is verified and active
 * 
 * @param locationId - Google Business location ID
 * @param socialAccountId - Social account ID to use for API auth
 * @returns Validation result
 */
export async function validateGoogleBusinessLocation(
    locationId: string,
    socialAccountId: string
): Promise<PlatformValidationResult> {
    try {
        const account = await db.socialAccount.findUnique({
            where: { id: socialAccountId },
            select: { accessToken: true, platform: true },
        });

        if (!account || account.platform !== 'GOOGLE_BUSINESS') {
            return { valid: false, error: 'Google Business account not found or invalid' };
        }

        const lateApiUrl = process.env.LATE_DEV_API_URL;
        if (!lateApiUrl) {
            logger.warn('LATE_DEV_API_URL not configured, skipping GBP validation');
            return { valid: true, warning: 'Location validation skipped - API proxy not configured' };
        }

        const response = await fetch(`${lateApiUrl}/google-business/locations/${locationId}`, {
            headers: {
                'Authorization': `Bearer ${account.accessToken}`,
            },
        });

        if (response.status === 404) {
            return { valid: false, error: 'Business location not found or was removed' };
        }

        if (response.status === 401) {
            return { valid: false, error: 'Google Business access has expired. Please reconnect.' };
        }

        if (response.ok) {
            const data = await response.json();

            // Check verification status
            if (data.verificationState !== 'VERIFIED') {
                return {
                    valid: false,
                    error: `Location is not verified (status: ${data.verificationState})`
                };
            }

            // Check for suspension
            if (data.isSuspended) {
                return { valid: false, error: 'Business location is suspended' };
            }
        }

        return { valid: true };
    } catch (error) {
        logger.error({ error, locationId }, 'Google Business location validation error');
        return { valid: true, warning: 'Could not verify location - network error' };
    }
}

/**
 * Validate all platform-specific resources for a post before publishing
 * 
 * @param postId - Post ID to validate
 * @returns Aggregated validation results
 */
export async function validatePostResources(
    postId: string
): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const post = await db.post.findUnique({
        where: { id: postId },
        select: {
            platform: true,
            socialAccountId: true,
            boardId: true, // Pinterest board ID
            location: true, // Location ID for geo-tagging
        },
    });

    if (!post) {
        return { valid: false, errors: ['Post not found'], warnings: [] };
    }

    // Pinterest board validation
    if (post.platform === 'PINTEREST' && post.boardId && post.socialAccountId) {
        const result = await validatePinterestBoard(post.boardId, post.socialAccountId);
        if (!result.valid && result.error) errors.push(result.error);
        if (result.warning) warnings.push(result.warning);
    }

    // Note: Google Business location validation would require adding a 
    // googleBusinessLocationId field to the Post model in schema.prisma
    // For now, GBP posts go through without location pre-validation.

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}
