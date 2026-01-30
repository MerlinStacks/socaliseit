/**
 * AI Configuration API
 * Manage OpenRouter API key and model selection per workspace
 * Only OWNER/ADMIN roles have access
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { encrypt, decrypt, maskSecret } from '@/lib/crypto';

/**
 * Checks if user has OWNER or ADMIN role in the workspace
 */
async function checkAdminAccess(workspaceId: string, userId: string): Promise<boolean> {
    const member = await db.workspaceMember.findUnique({
        where: {
            workspaceId_userId: { workspaceId, userId },
        },
    });
    return member?.role === 'OWNER' || member?.role === 'ADMIN';
}

/**
 * GET /api/settings/ai-config
 * Retrieve current AI configuration (API key masked)
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const hasAccess = await checkAdminAccess(session.user.currentWorkspaceId, session.user.id);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const aiSettings = await db.aISettings.findUnique({
            where: { workspaceId: session.user.currentWorkspaceId },
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
    } catch (error) {
        console.error('Failed to fetch AI config:', error);
        return NextResponse.json({ error: 'Failed to fetch configuration' }, { status: 500 });
    }
}

/**
 * PUT /api/settings/ai-config
 * Create or update AI configuration
 * Body: { apiKey?: string, selectedModel?: string, modelName?: string }
 */
export async function PUT(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const hasAccess = await checkAdminAccess(session.user.currentWorkspaceId, session.user.id);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const body = await request.json();
        const { apiKey, selectedModel, modelName } = body;

        // Get existing settings if any
        const existing = await db.aISettings.findUnique({
            where: { workspaceId: session.user.currentWorkspaceId },
        });

        // Determine the API key to use
        let encryptedApiKey: string;
        if (apiKey?.trim()) {
            // New API key provided - encrypt it
            encryptedApiKey = encrypt(apiKey.trim());
        } else if (existing) {
            // Keep existing key
            encryptedApiKey = existing.apiKey;
        } else {
            return NextResponse.json({ error: 'API key is required for initial setup' }, { status: 400 });
        }

        // Upsert the configuration
        const config = await db.aISettings.upsert({
            where: { workspaceId: session.user.currentWorkspaceId },
            update: {
                apiKey: encryptedApiKey,
                selectedModel: selectedModel ?? existing?.selectedModel,
                modelName: modelName ?? existing?.modelName,
                isConfigured: true,
            },
            create: {
                workspaceId: session.user.currentWorkspaceId,
                apiKey: encryptedApiKey,
                selectedModel: selectedModel ?? null,
                modelName: modelName ?? null,
                isConfigured: true,
            },
        });

        return NextResponse.json({
            success: true,
            config: {
                isConfigured: config.isConfigured,
                selectedModel: config.selectedModel,
                modelName: config.modelName,
            },
        });
    } catch (error) {
        console.error('Failed to save AI config:', error);
        return NextResponse.json({ error: 'Failed to save configuration' }, { status: 500 });
    }
}
