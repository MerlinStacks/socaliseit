/**
 * Draft Learning Service
 * 
 * Tracks user interactions with AI-generated drafts and learns from
 * acceptance/dismissal patterns to improve future recommendations.
 * 
 * Why: By tracking which drafts users accept, modify, or dismiss,
 * we can refine our scheduling suggestions over time.
 */

import { db } from '@/lib/db';
import { DraftAction, Platform, PostType } from '@/generated/prisma/enums';
import { getDay, getHours } from 'date-fns';

interface DraftFeedback {
    organizationId: string;
    postId?: string;
    action: DraftAction;
    platform: Platform;
    postType: PostType;
    suggestedTime: Date;
    finalTime?: Date;
    reason?: string;
}

/**
 * Record user interaction with an AI draft
 */
export async function recordDraftInteraction(feedback: DraftFeedback): Promise<void> {
    const suggestedDay = getDay(feedback.suggestedTime);
    const suggestedHour = getHours(feedback.suggestedTime);

    const finalDay = feedback.finalTime ? getDay(feedback.finalTime) : undefined;
    const finalHour = feedback.finalTime ? getHours(feedback.finalTime) : undefined;

    await db.draftInteraction.create({
        data: {
            organizationId: feedback.organizationId,
            postId: feedback.postId,
            action: feedback.action,
            platform: feedback.platform,
            postType: feedback.postType,
            suggestedDay,
            suggestedHour,
            finalDay,
            finalHour,
            reason: feedback.reason
        }
    });

    // Update engagement predictions based on this feedback
    await updatePredictionFromFeedback(
        feedback.organizationId,
        feedback.platform,
        feedback.postType,
        feedback.action,
        suggestedDay,
        suggestedHour,
        finalDay,
        finalHour
    );
}

/**
 * Update engagement predictions based on user feedback
 */
async function updatePredictionFromFeedback(
    organizationId: string,
    platform: Platform,
    postType: PostType,
    action: DraftAction,
    suggestedDay: number,
    suggestedHour: number,
    finalDay?: number,
    finalHour?: number
): Promise<void> {
    // Calculate score delta based on action
    let delta = 0;
    switch (action) {
        case 'ACCEPTED':
            delta = 5; // Strong positive signal
            break;
        case 'MODIFIED':
            delta = -2; // User preferred different time (penalize suggested)
            break;
        case 'DISMISSED':
            delta = -3; // Negative signal
            break;
        case 'EXPIRED':
            delta = -1; // Mild negative (user didn't engage with slot)
            break;
    }

    // Update prediction for suggested slot
    await upsertPrediction(organizationId, platform, postType, suggestedDay, suggestedHour, delta);

    // If user modified to a different time, boost that slot
    if (action === 'MODIFIED' && finalDay !== undefined && finalHour !== undefined) {
        // Boost the slot user actually chose
        await upsertPrediction(organizationId, platform, postType, finalDay, finalHour, 8);
    }
}

/**
 * Upsert engagement prediction with score adjustment
 */
async function upsertPrediction(
    organizationId: string,
    platform: Platform,
    postType: PostType,
    day: number,
    hour: number,
    scoreDelta: number
): Promise<void> {
    const existing = await db.engagementPrediction.findUnique({
        where: {
            organizationId_platform_postType_day_hour: {
                organizationId,
                platform,
                postType,
                day,
                hour
            }
        }
    });

    if (existing) {
        // Weighted average update to smooth out noise
        const newScore = Math.max(0, Math.min(100, existing.predictedScore + scoreDelta));
        const newConfidence = Math.min(1, existing.confidence + 0.01);

        await db.engagementPrediction.update({
            where: { id: existing.id },
            data: {
                predictedScore: newScore,
                confidence: newConfidence,
                sampleSize: { increment: 1 },
                lastUpdated: new Date()
            }
        });
    } else {
        // Create new prediction with base score
        const baseScore = 50 + scoreDelta;
        await db.engagementPrediction.create({
            data: {
                organizationId,
                platform,
                postType,
                day,
                hour,
                predictedScore: Math.max(0, Math.min(100, baseScore)),
                confidence: 0.1,
                sampleSize: 1
            }
        });
    }
}

/**
 * Get acceptance rate for a specific time slot
 */
export async function getSlotAcceptanceRate(
    organizationId: string,
    platform: Platform,
    day: number,
    hour: number
): Promise<{ acceptanceRate: number; totalInteractions: number }> {
    const interactions = await db.draftInteraction.findMany({
        where: {
            organizationId,
            platform,
            suggestedDay: day,
            suggestedHour: hour
        }
    });

    if (interactions.length === 0) {
        return { acceptanceRate: 0, totalInteractions: 0 };
    }

    const accepted = interactions.filter(i => i.action === 'ACCEPTED').length;
    return {
        acceptanceRate: accepted / interactions.length,
        totalInteractions: interactions.length
    };
}

/**
 * Get overall acceptance stats for an organization
 */
export async function getDraftAcceptanceStats(organizationId: string): Promise<{
    total: number;
    accepted: number;
    modified: number;
    dismissed: number;
    expired: number;
    acceptanceRate: number;
}> {
    const interactions = await db.draftInteraction.groupBy({
        by: ['action'],
        where: { organizationId },
        _count: { action: true }
    });

    const counts = {
        total: 0,
        accepted: 0,
        modified: 0,
        dismissed: 0,
        expired: 0
    };

    for (const i of interactions) {
        const count = i._count.action;
        counts.total += count;
        switch (i.action) {
            case 'ACCEPTED': counts.accepted = count; break;
            case 'MODIFIED': counts.modified = count; break;
            case 'DISMISSED': counts.dismissed = count; break;
            case 'EXPIRED': counts.expired = count; break;
        }
    }

    return {
        ...counts,
        acceptanceRate: counts.total > 0 ? counts.accepted / counts.total : 0
    };
}
