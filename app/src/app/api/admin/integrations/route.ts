/**
 * Admin Global Integration Settings API
 * Super admin management of third-party API integrations (e.g., Late.dev)
 * These settings are shared across all organizations
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { encrypt, decrypt, maskSecret } from '@/lib/crypto';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';
import { recordAuditLog, AUDIT_ACTIONS } from '@/lib/admin/audit';
import { logger } from '@/lib/logger';

const SETTINGS_ID = 'global_integration_settings';

/**
 * GET /api/admin/integrations
 * Retrieve global integration settings (API keys are masked)
 */
export const GET = withSuperAdmin(async (_request: NextRequest, _admin: AdminContext) => {
    const settings = await db.globalIntegrationSettings.findUnique({
        where: { id: SETTINGS_ID },
    });

    if (!settings) {
        return NextResponse.json({
            lateApiKey: null,
            lateProfileId: null,
            isConfigured: false,
        });
    }

    // Return masked values for display
    return NextResponse.json({
        lateApiKey: settings.lateApiKey ? maskSecret(decrypt(settings.lateApiKey)) : null,
        lateProfileId: settings.lateProfileId || null,
        isConfigured: Boolean(settings.lateApiKey),
    });
});

/**
 * PUT /api/admin/integrations
 * Save global integration settings (encrypts API keys)
 */
export const PUT = withSuperAdmin(async (request: NextRequest, admin: AdminContext) => {
    const body = await request.json();
    const { lateApiKey, lateProfileId } = body;

    // Get existing settings
    const existing = await db.globalIntegrationSettings.findUnique({
        where: { id: SETTINGS_ID },
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
    const settings = await db.globalIntegrationSettings.upsert({
        where: { id: SETTINGS_ID },
        create: {
            id: SETTINGS_ID,
            ...updateData,
        },
        update: updateData,
    });

    // Record audit log
    await recordAuditLog({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        actorId: admin.userId,
        targetType: 'global_integration_settings',
        metadata: {
            lateApiKeyChanged: !!lateApiKey && lateApiKey !== '********',
            lateProfileIdChanged: lateProfileId !== existing?.lateProfileId,
        },
        request,
    });

    logger.info('Updated global integration settings');

    return NextResponse.json({
        success: true,
        isConfigured: Boolean(settings.lateApiKey),
    });
});
