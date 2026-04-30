/**
 * Notification Settings API
 * Manages per-user notification preferences within a workspace
 */

import { NextRequest, NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/utils';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * GET /api/settings/notifications
 * 
 * Retrieves notification settings for the current user in their active organization.
 * Returns default values if no settings exist yet.
 */
export async function GET() {
    const session = await auth();
    if (!session?.user?.id || !session.user.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const settings = await db.notificationSettings.findUnique({
        where: {
            organizationId_userId: {
                organizationId: session.user.currentOrganizationId,
                userId: session.user.id,
            },
        },
    });

    // Return existing settings or defaults
    return NextResponse.json({
        postPublished: settings?.postPublished ?? true,
        postFailed: settings?.postFailed ?? true,
        postReadyToPublish: settings?.postReadyToPublish ?? true,
        tokenExpiring: settings?.tokenExpiring ?? true,
        weeklyDigest: settings?.weeklyDigest ?? false,
        newComment: settings?.newComment ?? true,
        newDM: settings?.newDM ?? true,
        newMention: settings?.newMention ?? true,
        newReview: settings?.newReview ?? true,
    });
}

/**
 * PATCH /api/settings/notifications
 * 
 * Updates notification settings for the current user.
 * Creates the settings record if it doesn't exist (upsert).
 */
export async function PATCH(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.id || !session.user.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parseResult = await safeParseJson(request);
    if (!parseResult.ok) {
        return NextResponse.json({ error: parseResult.error }, { status: 400 });
    }
    const body = parseResult.data;

    // Validate input - all fields should be booleans if provided
    const updates: Record<string, boolean> = {};
    if (typeof body.postPublished === 'boolean') updates.postPublished = body.postPublished as boolean;
    if (typeof body.postFailed === 'boolean') updates.postFailed = body.postFailed as boolean;
    if (typeof body.postReadyToPublish === 'boolean') updates.postReadyToPublish = body.postReadyToPublish as boolean;
    if (typeof body.tokenExpiring === 'boolean') updates.tokenExpiring = body.tokenExpiring as boolean;
    if (typeof body.weeklyDigest === 'boolean') updates.weeklyDigest = body.weeklyDigest as boolean;
    if (typeof body.newComment === 'boolean') updates.newComment = body.newComment as boolean;
    if (typeof body.newDM === 'boolean') updates.newDM = body.newDM as boolean;
    if (typeof body.newMention === 'boolean') updates.newMention = body.newMention as boolean;
    if (typeof body.newReview === 'boolean') updates.newReview = body.newReview as boolean;

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const settings = await db.notificationSettings.upsert({
        where: {
            organizationId_userId: {
                organizationId: session.user.currentOrganizationId,
                userId: session.user.id,
            },
        },
        create: {
            organizationId: session.user.currentOrganizationId,
            userId: session.user.id,
            ...updates,
        },
        update: updates,
    });

    return NextResponse.json({
        postPublished: settings.postPublished,
        postFailed: settings.postFailed,
        postReadyToPublish: settings.postReadyToPublish,
        tokenExpiring: settings.tokenExpiring,
        weeklyDigest: settings.weeklyDigest,
        newComment: settings.newComment,
        newDM: settings.newDM,
        newMention: settings.newMention,
        newReview: settings.newReview,
    });
}
