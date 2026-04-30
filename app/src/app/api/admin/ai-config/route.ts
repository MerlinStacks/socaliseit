/**
 * Admin Global AI Settings API
 * Super admin management of OpenRouter API key and model selection
 * These settings are shared across all organizations
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { safeParseJson } from '@/lib/utils';
import { encrypt, decrypt, maskSecret } from '@/lib/crypto';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';
import { recordAuditLog, AUDIT_ACTIONS } from '@/lib/admin/audit';

const SETTINGS_ID = 'global_ai_settings';

/**
 * GET /api/admin/ai-config
 * Retrieve current global AI configuration (API key masked)
 */
export const GET = withSuperAdmin(async (_request: NextRequest, _admin: AdminContext) => {
    const aiSettings = await db.globalAISettings.findUnique({
        where: { id: SETTINGS_ID },
    });

    if (!aiSettings) {
        return NextResponse.json({
            config: {
                isConfigured: false,
                apiKeyMasked: null,
                selectedModel: null,
                modelName: null,
            },
        });
    }

    // Decrypt and mask the API key
    let maskedKey = null;
    try {
        const decryptedKey = decrypt(aiSettings.apiKey);
        maskedKey = maskSecret(decryptedKey);
    } catch {
        // If decryption fails, key is corrupted
        maskedKey = '(invalid key)';
    }

    return NextResponse.json({
        config: {
            isConfigured: aiSettings.isConfigured,
            apiKeyMasked: maskedKey,
            selectedModel: aiSettings.selectedModel,
            modelName: aiSettings.modelName,
            updatedAt: aiSettings.updatedAt,
        },
    });
});

/**
 * PUT /api/admin/ai-config
 * Create or update global AI configuration
 * Body: { apiKey?: string, selectedModel?: string, modelName?: string }
 */
export const PUT = withSuperAdmin(async (request: NextRequest, admin: AdminContext) => {
    const parseResult = await safeParseJson(request);
    if (!parseResult.ok) {
        return NextResponse.json({ error: parseResult.error }, { status: 400 });
    }
    const body = parseResult.data;
    const { apiKey, selectedModel, modelName } = body;

    // Get existing settings if any
    const existing = await db.globalAISettings.findUnique({
        where: { id: SETTINGS_ID },
    });

    // Determine the API key to use
    let encryptedApiKey: string;
    if ((apiKey as string)?.trim()) {
        // New API key provided - encrypt it
        encryptedApiKey = encrypt((apiKey as string).trim());
    } else if (existing) {
        // Keep existing key
        encryptedApiKey = existing.apiKey;
    } else {
        return NextResponse.json({ error: 'API key is required for initial setup' }, { status: 400 });
    }

    // Upsert the configuration
    const config = await db.globalAISettings.upsert({
        where: { id: SETTINGS_ID },
        update: {
            apiKey: encryptedApiKey,
            selectedModel: (selectedModel as string | null) ?? existing?.selectedModel,
            modelName: (modelName as string | null) ?? existing?.modelName,
            isConfigured: true,
        },
        create: {
            id: SETTINGS_ID,
            apiKey: encryptedApiKey,
            selectedModel: selectedModel ?? null,
            modelName: modelName ?? null,
            isConfigured: true,
        },
    });

    // Record audit log
    await recordAuditLog({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        actorId: admin.userId,
        targetType: 'global_ai_settings',
        metadata: {
            modelChanged: selectedModel !== existing?.selectedModel,
            apiKeyChanged: !!(apiKey as string)?.trim(),
        },
        request,
    });

    return NextResponse.json({
        success: true,
        config: {
            isConfigured: config.isConfigured,
            selectedModel: config.selectedModel,
            modelName: config.modelName,
        },
    });
});
