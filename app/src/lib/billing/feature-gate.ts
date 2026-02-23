/**
 * Feature Gate — Server-side access control
 *
 * Why: Centralized check that compares the org's tier limits
 * against current usage counts. Returns a structured result
 * so API routes can return helpful error messages.
 */

import { db } from '../db';
import { getPlanLimits, type GatedFeature } from './plan-config';

export interface GateResult {
    /** Whether the action is allowed */
    allowed: boolean;
    /** Human-readable reason when blocked */
    reason?: string;
    /** The tier's limit for this feature */
    limit?: number;
    /** The org's current usage */
    current?: number;
}

/**
 * Checks whether an org can use a given feature based on its tier.
 *
 * Why: ADMIN and ENTERPRISE tiers always return `{ allowed: true }`
 * without hitting the database for usage counts. This avoids
 * unnecessary queries for privileged orgs.
 */
export async function checkFeatureGate(
    organizationId: string,
    feature: GatedFeature
): Promise<GateResult> {
    const org = await db.organization.findUnique({
        where: { id: organizationId },
        select: { tier: true },
    });

    if (!org) {
        return { allowed: false, reason: 'Organization not found' };
    }

    const tier = org.tier;

    // Why: ADMIN and ENTERPRISE bypass all gates — no usage counting needed
    if (tier === 'ADMIN' || tier === 'ENTERPRISE') {
        return { allowed: true };
    }

    const limits = getPlanLimits(tier);

    // Boolean features — simple check
    const booleanFeatures: GatedFeature[] = [
        'videoEditor',
        'analyticsExport',
        'customBranding',
        'prioritySupport',
    ];

    if (booleanFeatures.includes(feature)) {
        const enabled = limits[feature] as boolean;
        return enabled
            ? { allowed: true }
            : { allowed: false, reason: `${feature} is not available on the ${tier} plan` };
    }

    // Numerical features — compare usage against limit
    const limit = limits[feature] as number;
    const current = await getUsageCount(organizationId, feature);

    if (current >= limit) {
        return {
            allowed: false,
            reason: `You've reached the ${tier} plan limit for ${feature}`,
            limit,
            current,
        };
    }

    return { allowed: true, limit, current };
}

/**
 * Queries the current usage count for a numerical feature.
 *
 * Why: Each feature maps to a different Prisma query. We keep
 * these centralized so there's one place to update when schema changes.
 */
async function getUsageCount(organizationId: string, feature: GatedFeature): Promise<number> {
    switch (feature) {
        case 'socialAccounts':
            return db.socialAccount.count({
                where: { organizationId, isActive: true },
            });

        case 'teamMembers':
            return db.organizationMember.count({
                where: { organizationId },
            });

        case 'scheduledPostsPerMonth': {
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);
            return db.post.count({
                where: {
                    organizationId,
                    status: 'SCHEDULED',
                    createdAt: { gte: startOfMonth },
                },
            });
        }

        case 'aiGenerationsPerMonth': {
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);
            return db.post.count({
                where: {
                    organizationId,
                    isAiGenerated: true,
                    createdAt: { gte: startOfMonth },
                },
            });
        }

        case 'competitorTracking':
            return db.competitor.count({
                where: { organizationId },
            });

        default:
            return 0;
    }
}
