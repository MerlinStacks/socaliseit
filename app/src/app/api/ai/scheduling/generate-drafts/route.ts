/**
 * AI Draft Generation API
 * 
 * POST /api/ai/scheduling/generate-drafts - Triggers AI draft generation
 * DELETE /api/ai/scheduling/generate-drafts - Clears all AI drafts and regenerates
 * POST with ?force=true - Same as DELETE, clears and regenerates
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { generateAiDrafts } from '@/lib/ai/draft-generator';
import { db } from '@/lib/db';
import { createRouteLogger } from '@/lib/logger';
import { checkRateLimit, EXPENSIVE_RATE_LIMIT, createRateLimitHeaders } from '@/lib/rate-limit';

/**
 * Delete all AI drafts for organization and regenerate fresh
 */
async function clearAndRegenerate(organizationId: string) {
    // Delete ALL AI drafts (not just past ones)
    const deleted = await db.post.deleteMany({
        where: {
            organizationId,
            isAiGenerated: true,
            status: 'DRAFT'
        }
    });

    // Regenerate fresh
    const result = await generateAiDrafts(organizationId);

    return {
        deleted: deleted.count,
        ...result
    };
}

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const rateLimitResult = await checkRateLimit(
            `${session.user.currentOrganizationId}:ai-drafts`, EXPENSIVE_RATE_LIMIT
        );
        if (!rateLimitResult.allowed) {
            return NextResponse.json(
                { success: false, error: 'Rate limit exceeded. Please try again later.' },
                { status: 429, headers: createRateLimitHeaders(rateLimitResult) }
            );
        }

        const { searchParams } = new URL(request.url);
        const force = searchParams.get('force') === 'true';

        if (force) {
            const result = await clearAndRegenerate(session.user.currentOrganizationId);
            return NextResponse.json({
                success: true,
                message: 'AI drafts cleared and regenerated',
                ...result
            });
        }

        const result = await generateAiDrafts(session.user.currentOrganizationId);

        return NextResponse.json({
            success: true,
            ...result
        });

    } catch (error) {
        createRouteLogger('API', '/api/ai/scheduling/generate-drafts').error({ err: error }, 'Error generating AI drafts');
        return NextResponse.json(
            { success: false, error: 'Failed to generate AI drafts' },
            { status: 500 }
        );
    }
}

/**
 * DELETE - Clear AI drafts (optionally skip regeneration)
 * 
 * Body: { deleteOnly?: boolean }
 * - deleteOnly: true  = Delete AI drafts WITHOUT regenerating
 * - deleteOnly: false = Delete AI drafts AND regenerate fresh (default)
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Parse body for deleteOnly flag
        let deleteOnly = false;
        try {
            const body = await request.json();
            deleteOnly = body?.deleteOnly === true;
        } catch {
            // No body or invalid JSON - use default behavior
        }

        if (deleteOnly) {
            // Delete AI drafts WITHOUT regenerating
            const deleted = await db.post.deleteMany({
                where: {
                    organizationId: session.user.currentOrganizationId,
                    isAiGenerated: true,
                    status: 'DRAFT'
                }
            });

            return NextResponse.json({
                success: true,
                message: 'AI drafts deleted',
                deleted: deleted.count
            });
        }

        // Default: Delete and regenerate
        const result = await clearAndRegenerate(session.user.currentOrganizationId);

        return NextResponse.json({
            success: true,
            message: 'AI drafts cleared and regenerated',
            ...result
        });

    } catch (error) {
        createRouteLogger('API', '/api/ai/scheduling/generate-drafts').error({ err: error }, 'Error clearing AI drafts');
        return NextResponse.json(
            { success: false, error: 'Failed to clear AI drafts' },
            { status: 500 }
        );
    }
}
