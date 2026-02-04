/**
 * Integration Settings API
 *
 * Why: Manages third-party API integrations (e.g., Late.dev) that are stored
 * per-workspace in the database (not in env files) for multi-tenant support.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { encrypt, decrypt, maskSecret } from '@/lib/crypto';

/**
 * GET /api/settings/integrations
 * Retrieve integration settings (API keys are masked)
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const membership = await db.organizationMember.findFirst({
            where: { userId: session.user.id },
            include: { organization: true },
        });

        if (!membership) {
            return NextResponse.json({ error: 'No workspace found' }, { status: 400 });
        }

        const settings = await db.integrationSettings.findUnique({
            where: { organizationId: membership.organizationId },
        });

        // Return masked values for display
        return NextResponse.json({
            lateApiKey: settings?.lateApiKey ? maskSecret(decrypt(settings.lateApiKey)) : null,
            lateProfileId: settings?.lateProfileId || null,
            isConfigured: Boolean(settings?.lateApiKey),
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch integration settings');
        return NextResponse.json(
            { error: 'Failed to fetch settings' },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/settings/integrations
 * Save integration settings (encrypts API keys)
 */
export async function PUT(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const membership = await db.organizationMember.findFirst({
            where: { userId: session.user.id },
            include: { organization: true },
        });

        if (!membership) {
            return NextResponse.json({ error: 'No workspace found' }, { status: 400 });
        }

        // Only allow admins/owners to modify settings
        if (!['OWNER', 'ADMIN'].includes(membership.role)) {
            return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
        }

        const body = await request.json();
        const { lateApiKey, lateProfileId } = body;

        // Get existing settings
        const existing = await db.integrationSettings.findUnique({
            where: { organizationId: membership.organizationId },
        });

        // Prepare update data - only update if new value provided
        const updateData: {
            lateApiKey?: string;
            lateProfileId?: string | null;
        } = {};

        if (lateApiKey && lateApiKey !== '********') {
            // Encrypt the new API key
            updateData.lateApiKey = encrypt(lateApiKey);
        }

        if (lateProfileId !== undefined) {
            updateData.lateProfileId = lateProfileId || null;
        }

        // Upsert the settings
        const settings = await db.integrationSettings.upsert({
            where: { organizationId: membership.organizationId },
            create: {
                organizationId: membership.organizationId,
                ...updateData,
            },
            update: updateData,
        });

        logger.info(
            { organizationId: membership.organizationId },
            'Updated integration settings'
        );

        return NextResponse.json({
            success: true,
            isConfigured: Boolean(settings.lateApiKey),
        });
    } catch (error) {
        logger.error({ error }, 'Failed to update integration settings');
        return NextResponse.json(
            { error: 'Failed to save settings' },
            { status: 500 }
        );
    }
}
