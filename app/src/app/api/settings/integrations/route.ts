/**
 * Integration Settings API (User-Facing Read-Only)
 * Returns global integration settings status for the user settings page.
 * Actual configuration is managed by super admins via /api/admin/integrations.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decrypt, maskSecret } from '@/lib/crypto';

/**
 * GET /api/settings/integrations
 * Retrieve global integration settings (API keys are masked).
 * This is read-only for regular users - configuration is super admin only.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch global integration settings (super admin configured)
        const settings = await db.globalIntegrationSettings.findUnique({
            where: { id: 'global_integration_settings' },
        });

        // Return masked values for display
        let maskedKey = null;
        if (settings?.lateApiKey) {
            try {
                maskedKey = maskSecret(decrypt(settings.lateApiKey));
            } catch {
                maskedKey = '(configured)';
            }
        }

        return NextResponse.json({
            lateApiKey: maskedKey,
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
 * This endpoint is now deprecated for regular users.
 * Integration settings are managed by super admins via /api/admin/integrations.
 */
export async function PUT() {
    return NextResponse.json(
        { error: 'Integration settings are managed by your administrator. Please contact them to update settings.' },
        { status: 403 }
    );
}
