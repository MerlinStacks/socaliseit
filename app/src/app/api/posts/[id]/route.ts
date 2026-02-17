/**
 * Single Post API Routes
 * GET, PUT, DELETE, PATCH for individual posts
 *
 * Why: Thin dispatcher — auth guard + delegate to post-handlers.ts.
 * Business logic lives in post-handlers to keep this file under 200 lines.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
    handleGetPost,
    handleUpdatePost,
    handleDeletePost,
    handlePatchPost,
    type HandlerContext,
} from './post-handlers';

/**
 * Build the shared handler context from the session and route params.
 * Returns null (with a 401 response) if the user is not authenticated.
 */
async function buildContext(
    params: Promise<{ id: string }>,
): Promise<{ ctx: HandlerContext } | { error: NextResponse }> {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }
    const { id } = await params;
    return {
        ctx: {
            id,
            organizationId: session.user.currentOrganizationId,
            userId: session.user.id,
            userName: session.user.name || 'Unknown',
        },
    };
}

/**
 * GET /api/posts/[id] - Get single post with all relations
 * Why: Needed for edit mode in compose page to load existing post data
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const result = await buildContext(params);
    if ('error' in result) return result.error;
    return handleGetPost(result.ctx);
}

/**
 * PUT /api/posts/[id] - Full update of post
 * Why: Handles edit mode from compose page
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const result = await buildContext(params);
    if ('error' in result) return result.error;

    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    return handleUpdatePost(result.ctx, body);
}

/**
 * DELETE /api/posts/[id] - Delete post and cancel any scheduled jobs
 */
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const result = await buildContext(params);
    if ('error' in result) return result.error;
    return handleDeletePost(result.ctx);
}

/**
 * PATCH /api/posts/[id] - Partial update (reschedule, status change)
 * Why: Handles calendar drag-drop reschedule action
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const result = await buildContext(params);
    if ('error' in result) return result.error;

    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    return handlePatchPost(result.ctx, body);
}
