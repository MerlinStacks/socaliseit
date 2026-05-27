/**
 * AI Configuration API (User-Facing Read-Only)
 * Returns global AI configuration status for the user settings page.
 * Actual configuration is managed by super admins via /api/admin/ai-config.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { maskSecret, decrypt } from '@/lib/crypto';
import { createRouteLogger } from '@/lib/logger';

/**
 * GET /api/settings/ai-config
 * Retrieve current global AI configuration (API key masked).
 * This is read-only for regular users - configuration is super admin only.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch global AI settings (super admin configured)
        const aiSettings = await db.globalAISettings.findUnique({
            where: { id: 'global_ai_settings' },
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
                    sebRefreshCadence: 'daily',
                    sebMaxVideoFrames: 20,
                    sebMaxReportsPerDay: 3,
                    sebMaxChatsPerDay: 30,
                    sebMaxVideosPerReport: 10,
                },
            });
        }

        // Decrypt and mask the API key for display
        let maskedKey = null;
        try {
            const decryptedKey = decrypt(aiSettings.apiKey);
            maskedKey = maskSecret(decryptedKey);
        } catch {
            maskedKey = '(configured)';
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
                sebRefreshCadence: aiSettings.sebRefreshCadence,
                sebMaxVideoFrames: aiSettings.sebMaxVideoFrames,
                sebMaxReportsPerDay: aiSettings.sebMaxReportsPerDay,
                sebMaxChatsPerDay: aiSettings.sebMaxChatsPerDay,
                sebMaxVideosPerReport: aiSettings.sebMaxVideosPerReport,
                updatedAt: aiSettings.updatedAt,
            },
        });
    } catch (error) {
        createRouteLogger('API', '/api/settings/ai-config').error({ err: error }, 'Failed to fetch AI config');
        return NextResponse.json({ error: 'Failed to fetch configuration' }, { status: 500 });
    }
}

/**
 * PUT /api/settings/ai-config
 * This endpoint is now deprecated for regular users.
 * AI configuration is managed by super admins via /api/admin/ai-config.
 */
export async function PUT() {
    return NextResponse.json(
        { error: 'AI configuration is managed by your administrator. Please contact them to update settings.' },
        { status: 403 }
    );
}
