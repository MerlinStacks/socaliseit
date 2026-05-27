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
                sebEnabled: true,
                sebProactiveEnabled: true,
                sebModel: null,
                sebModelName: null,
                sebSystemPrompt: null,
                sebTemperature: 0.55,
                sebRefreshCadence: 'daily',
                sebMaxVideoFrames: 20,
                sebMaxReportsPerDay: 3,
                sebMaxChatsPerDay: 30,
                sebMaxVideosPerReport: 10,
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
            sebEnabled: aiSettings.sebEnabled,
            sebProactiveEnabled: aiSettings.sebProactiveEnabled,
            sebModel: aiSettings.sebModel,
            sebModelName: aiSettings.sebModelName,
            sebSystemPrompt: aiSettings.sebSystemPrompt,
            sebTemperature: aiSettings.sebTemperature,
            sebRefreshCadence: aiSettings.sebRefreshCadence,
            sebMaxVideoFrames: aiSettings.sebMaxVideoFrames,
            sebMaxReportsPerDay: aiSettings.sebMaxReportsPerDay,
            sebMaxChatsPerDay: aiSettings.sebMaxChatsPerDay,
            sebMaxVideosPerReport: aiSettings.sebMaxVideosPerReport,
            updatedAt: aiSettings.updatedAt,
        },
    });
});

/**
 * PUT /api/admin/ai-config
 * Create or update global AI configuration
 * Body: { apiKey?: string, selectedModel?: string, modelName?: string, seb*?: ... }
 */
export const PUT = withSuperAdmin(async (request: NextRequest, admin: AdminContext) => {
    const parseResult = await safeParseJson(request);
    if (!parseResult.ok) {
        return NextResponse.json({ error: parseResult.error }, { status: 400 });
    }
    const body = parseResult.data;
    const {
        apiKey,
        selectedModel,
        modelName,
        sebEnabled,
        sebProactiveEnabled,
        sebModel,
        sebModelName,
        sebSystemPrompt,
        sebTemperature,
        sebRefreshCadence,
        sebMaxVideoFrames,
        sebMaxReportsPerDay,
        sebMaxChatsPerDay,
        sebMaxVideosPerReport,
    } = body;

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
            sebEnabled: typeof sebEnabled === 'boolean' ? sebEnabled : existing?.sebEnabled ?? true,
            sebProactiveEnabled: typeof sebProactiveEnabled === 'boolean' ? sebProactiveEnabled : existing?.sebProactiveEnabled ?? true,
            sebModel: (sebModel as string | null) ?? existing?.sebModel,
            sebModelName: (sebModelName as string | null) ?? existing?.sebModelName,
            sebSystemPrompt: (sebSystemPrompt as string | null) ?? existing?.sebSystemPrompt,
            sebTemperature: typeof sebTemperature === 'number' ? Math.min(Math.max(sebTemperature, 0), 1.5) : existing?.sebTemperature ?? 0.55,
            sebRefreshCadence: (sebRefreshCadence as string | null) ?? existing?.sebRefreshCadence ?? 'daily',
            sebMaxVideoFrames: typeof sebMaxVideoFrames === 'number' ? Math.min(Math.max(Math.round(sebMaxVideoFrames), 1), 20) : existing?.sebMaxVideoFrames ?? 20,
            sebMaxReportsPerDay: typeof sebMaxReportsPerDay === 'number' ? Math.min(Math.max(Math.round(sebMaxReportsPerDay), 1), 20) : existing?.sebMaxReportsPerDay ?? 3,
            sebMaxChatsPerDay: typeof sebMaxChatsPerDay === 'number' ? Math.min(Math.max(Math.round(sebMaxChatsPerDay), 1), 200) : existing?.sebMaxChatsPerDay ?? 30,
            sebMaxVideosPerReport: typeof sebMaxVideosPerReport === 'number' ? Math.min(Math.max(Math.round(sebMaxVideosPerReport), 1), 50) : existing?.sebMaxVideosPerReport ?? 10,
            isConfigured: true,
        },
        create: {
            id: SETTINGS_ID,
            apiKey: encryptedApiKey,
            selectedModel: selectedModel ?? null,
            modelName: modelName ?? null,
            sebEnabled: typeof sebEnabled === 'boolean' ? sebEnabled : true,
            sebProactiveEnabled: typeof sebProactiveEnabled === 'boolean' ? sebProactiveEnabled : true,
            sebModel: sebModel ?? null,
            sebModelName: sebModelName ?? null,
            sebSystemPrompt: sebSystemPrompt ?? null,
            sebTemperature: typeof sebTemperature === 'number' ? Math.min(Math.max(sebTemperature, 0), 1.5) : 0.55,
            sebRefreshCadence: (sebRefreshCadence as string | null) ?? 'daily',
            sebMaxVideoFrames: typeof sebMaxVideoFrames === 'number' ? Math.min(Math.max(Math.round(sebMaxVideoFrames), 1), 20) : 20,
            sebMaxReportsPerDay: typeof sebMaxReportsPerDay === 'number' ? Math.min(Math.max(Math.round(sebMaxReportsPerDay), 1), 20) : 3,
            sebMaxChatsPerDay: typeof sebMaxChatsPerDay === 'number' ? Math.min(Math.max(Math.round(sebMaxChatsPerDay), 1), 200) : 30,
            sebMaxVideosPerReport: typeof sebMaxVideosPerReport === 'number' ? Math.min(Math.max(Math.round(sebMaxVideosPerReport), 1), 50) : 10,
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
            sebModelChanged: sebModel !== existing?.sebModel,
            sebPromptChanged: sebSystemPrompt !== existing?.sebSystemPrompt,
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
            sebEnabled: config.sebEnabled,
            sebProactiveEnabled: config.sebProactiveEnabled,
            sebModel: config.sebModel,
            sebModelName: config.sebModelName,
            sebSystemPrompt: config.sebSystemPrompt,
            sebTemperature: config.sebTemperature,
            sebRefreshCadence: config.sebRefreshCadence,
            sebMaxVideoFrames: config.sebMaxVideoFrames,
            sebMaxReportsPerDay: config.sebMaxReportsPerDay,
            sebMaxChatsPerDay: config.sebMaxChatsPerDay,
            sebMaxVideosPerReport: config.sebMaxVideosPerReport,
        },
    });
});
