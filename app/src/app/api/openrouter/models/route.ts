/**
 * OpenRouter Models Proxy API
 * Fetches available models from OpenRouter API
 * Requires a valid API key configured in workspace AI settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';

/** Model data structure from OpenRouter API */
interface OpenRouterModel {
    id: string;
    name: string;
    description?: string;
    context_length: number;
    pricing: {
        prompt: string;
        completion: string;
    };
    architecture?: {
        modality?: string;
    };
}

/** Simplified model for client response */
interface ClientModel {
    id: string;
    name: string;
    description: string;
    contextLength: number;
    promptPrice: string;
    completionPrice: string;
    modality: string;
}

// Cache for models list (5 minute TTL)
let modelsCache: { data: ClientModel[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * GET /api/openrouter/models
 * Query params: ?search=query (optional)
 * Returns filtered model list from OpenRouter
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get the workspace's API key
        const aiSettings = await db.aISettings.findUnique({
            where: { workspaceId: session.user.currentWorkspaceId },
        });

        if (!aiSettings?.isConfigured) {
            return NextResponse.json(
                { error: 'OpenRouter API key not configured' },
                { status: 400 }
            );
        }

        // Decrypt the API key
        let apiKey: string;
        try {
            apiKey = decrypt(aiSettings.apiKey);
        } catch {
            return NextResponse.json(
                { error: 'Invalid API key - please reconfigure' },
                { status: 400 }
            );
        }

        // Check cache
        const now = Date.now();
        if (modelsCache && now - modelsCache.timestamp < CACHE_TTL_MS) {
            const searchQuery = request.nextUrl.searchParams.get('search')?.toLowerCase() || '';
            const filtered = filterModels(modelsCache.data, searchQuery);
            return NextResponse.json({ models: filtered });
        }

        // Fetch from OpenRouter API
        const response = await fetch('https://openrouter.ai/api/v1/models', {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://socialiseit.app',
                'X-Title': 'SocialiseIT',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenRouter API error:', response.status, errorText);
            return NextResponse.json(
                { error: `OpenRouter API error: ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        const models: OpenRouterModel[] = data.data || [];

        // Transform to client-friendly format
        const clientModels: ClientModel[] = models.map((m) => ({
            id: m.id,
            name: m.name,
            description: m.description || '',
            contextLength: m.context_length,
            promptPrice: m.pricing?.prompt || '0',
            completionPrice: m.pricing?.completion || '0',
            modality: m.architecture?.modality || 'text->text',
        }));

        // Update cache
        modelsCache = { data: clientModels, timestamp: now };

        // Apply search filter
        const searchQuery = request.nextUrl.searchParams.get('search')?.toLowerCase() || '';
        const filtered = filterModels(clientModels, searchQuery);

        return NextResponse.json({ models: filtered });
    } catch (error) {
        console.error('Failed to fetch OpenRouter models:', error);
        return NextResponse.json(
            { error: 'Failed to fetch models' },
            { status: 500 }
        );
    }
}

/**
 * Filters models by search query (matches id, name, or description)
 */
function filterModels(models: ClientModel[], query: string): ClientModel[] {
    if (!query) return models;

    return models.filter((m) =>
        m.id.toLowerCase().includes(query) ||
        m.name.toLowerCase().includes(query) ||
        m.description.toLowerCase().includes(query)
    );
}
