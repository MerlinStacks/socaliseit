/**
 * Post Errors API Route
 * GET /api/posts/[id]/errors - Fetch publish errors for a post
 *
 * Why: The post-failed page needs to display error details to the user.
 * Kept separate from the main post GET to avoid bloating the compose editor payload.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * Returns the most recent publish errors for a post, ordered newest first.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify the post belongs to this organization
    const post = await db.post.findUnique({
        where: { id },
        select: { organizationId: true },
    });

    if (!post || post.organizationId !== session.user.currentOrganizationId) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const errors = await db.publishError.findMany({
        where: { postId: id },
        orderBy: { occurredAt: 'desc' },
        take: 10,
        select: {
            platform: true,
            errorHuman: true,
            suggestion: true,
            occurredAt: true,
        },
    });

    return NextResponse.json(errors);
}
