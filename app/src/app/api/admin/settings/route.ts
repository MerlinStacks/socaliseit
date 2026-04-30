/**
 * Admin Platform Settings API
 * Get and update global platform configuration
 */

import { NextResponse, type NextRequest } from 'next/server';
import { safeParseJson } from '@/lib/utils';
import { z } from 'zod';
import { db } from '@/lib/db';
import { encrypt, decrypt, maskSecret } from '@/lib/crypto';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';
import { recordAuditLog, AUDIT_ACTIONS } from '@/lib/admin/audit';

const SETTINGS_ID = 'platform_settings';

const UpdateSettingsSchema = z.object({
    registrationEnabled: z.boolean().optional(),
    maintenanceMode: z.boolean().optional(),
    maintenanceMessage: z.string().max(500).nullable().optional(),
    maxOrganizationsPerUser: z.number().min(1).max(100).optional(),
    maxMembersPerOrganization: z.number().min(1).max(1000).optional(),
    rateLimitRequestsPerMinute: z.number().min(10).max(10000).optional(),
    tiktokDiscoveryToken: z.string().nullable().optional(),
});

/**
 * GET /api/admin/settings
 * Get current platform settings
 */
export const GET = withSuperAdmin(async (request: NextRequest, admin: AdminContext) => {
    // Get or create settings singleton
    let settings = await db.platformSettings.findUnique({
        where: { id: SETTINGS_ID },
    });

    if (!settings) {
        settings = await db.platformSettings.create({
            data: { id: SETTINGS_ID },
        });
    }

    // Mask the discovery token if present
    let tiktokDiscoveryTokenMasked: string | null = null;
    if (settings.tiktokDiscoveryToken) {
        try {
            const decrypted = decrypt(settings.tiktokDiscoveryToken);
            tiktokDiscoveryTokenMasked = maskSecret(decrypted);
        } catch {
            tiktokDiscoveryTokenMasked = '(corrupted)';
        }
    }

    return NextResponse.json({
        settings: {
            ...settings,
            tiktokDiscoveryToken: undefined, // Never send raw encrypted value
            tiktokDiscoveryTokenMasked,
        },
    });
});

/**
 * PATCH /api/admin/settings
 * Update platform settings
 */
export const PATCH = withSuperAdmin(async (request: NextRequest, admin: AdminContext) => {
    const parseResult = await safeParseJson(request);
    if (!parseResult.ok) {
        return NextResponse.json({ error: parseResult.error }, { status: 400 });
    }
    const body = parseResult.data;
    const parsed = UpdateSettingsSchema.safeParse(body);

    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation Error', details: parsed.error.flatten() },
            { status: 400 }
        );
    }

    // Get current settings for comparison
    const currentSettings = await db.platformSettings.findUnique({
        where: { id: SETTINGS_ID },
    });

    // Encrypt the discovery token if provided
    const updateData: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.tiktokDiscoveryToken !== undefined) {
        if (parsed.data.tiktokDiscoveryToken) {
            updateData.tiktokDiscoveryToken = encrypt(parsed.data.tiktokDiscoveryToken);
        } else {
            updateData.tiktokDiscoveryToken = null; // Allow clearing
        }
    }

    const settings = await db.platformSettings.upsert({
        where: { id: SETTINGS_ID },
        create: {
            id: SETTINGS_ID,
            ...updateData,
        },
        update: updateData,
    });

    // Record specific actions based on what changed
    if (parsed.data.registrationEnabled !== undefined &&
        parsed.data.registrationEnabled !== currentSettings?.registrationEnabled) {
        await recordAuditLog({
            action: AUDIT_ACTIONS.SETTINGS_REGISTRATION_TOGGLE,
            actorId: admin.userId,
            targetType: 'settings',
            metadata: {
                registrationEnabled: parsed.data.registrationEnabled,
                previous: currentSettings?.registrationEnabled,
            },
            request,
        });
    }

    if (parsed.data.maintenanceMode !== undefined &&
        parsed.data.maintenanceMode !== currentSettings?.maintenanceMode) {
        await recordAuditLog({
            action: AUDIT_ACTIONS.SETTINGS_MAINTENANCE_TOGGLE,
            actorId: admin.userId,
            targetType: 'settings',
            metadata: {
                maintenanceMode: parsed.data.maintenanceMode,
                maintenanceMessage: parsed.data.maintenanceMessage,
            },
            request,
        });
    }

    // Record general settings update
    await recordAuditLog({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        actorId: admin.userId,
        targetType: 'settings',
        metadata: { changes: parsed.data },
        request,
    });

    return NextResponse.json({ settings });
});
