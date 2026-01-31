/**
 * Notification Settings API
 * Manages per-user notification preferences within a workspace
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * GET /api/settings/notifications
 * 
 * Retrieves notification settings for the current user in their active workspace.
 * Returns default values if no settings exist yet.
 */
export async function GET() {
    const session = await auth();
    if (!session?.user?.id || !session.user.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const settings = await db.notificationSettings.findUnique({
        where: {
            workspaceId_userId: {
                workspaceId: session.user.currentWorkspaceId,
                userId: session.user.id,
            },
        },
    });

    // Return existing settings or defaults
    return NextResponse.json({
        postPublished: settings?.postPublished ?? true,
        postFailed: settings?.postFailed ?? true,
        tokenExpiring: settings?.tokenExpiring ?? true,
        weeklyDigest: settings?.weeklyDigest ?? false,
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
    if (!session?.user?.id || !session.user.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { postPublished, postFailed, tokenExpiring, weeklyDigest } = body;

    // Validate input - all fields should be booleans if provided
    const updates: Record<string, boolean> = {};
    if (typeof postPublished === 'boolean') updates.postPublished = postPublished;
    if (typeof postFailed === 'boolean') updates.postFailed = postFailed;
    if (typeof tokenExpiring === 'boolean') updates.tokenExpiring = tokenExpiring;
    if (typeof weeklyDigest === 'boolean') updates.weeklyDigest = weeklyDigest;

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const settings = await db.notificationSettings.upsert({
        where: {
            workspaceId_userId: {
                workspaceId: session.user.currentWorkspaceId,
                userId: session.user.id,
            },
        },
        create: {
            workspaceId: session.user.currentWorkspaceId,
            userId: session.user.id,
            ...updates,
        },
        update: updates,
    });

    return NextResponse.json({
        postPublished: settings.postPublished,
        postFailed: settings.postFailed,
        tokenExpiring: settings.tokenExpiring,
        weeklyDigest: settings.weeklyDigest,
    });
}
