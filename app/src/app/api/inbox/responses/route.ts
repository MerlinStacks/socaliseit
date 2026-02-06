/**
 * Saved Responses API (Canned Replies)
 *
 * GET  - List all saved responses
 * POST - Create a new saved response
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const createResponseSchema = z.object({
    name: z.string().min(1).max(50),
    content: z.string().min(1).max(2000),
    shortcut: z.string().regex(/^\/[a-z0-9_-]+$/).optional(),
    category: z.string().max(50).optional(),
});

/**
 * List all saved responses for the organization
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const responses = await db.savedResponse.findMany({
            where: { organizationId: session.user.currentOrganizationId },
            orderBy: [
                { usageCount: 'desc' },
                { name: 'asc' },
            ],
        });

        return NextResponse.json({ data: responses });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch saved responses');
        return NextResponse.json(
            { error: 'Failed to fetch saved responses' },
            { status: 500 }
        );
    }
}

/**
 * Create a new saved response
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const parsed = createResponseSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request', details: parsed.error.flatten() },
                { status: 400 }
            );
        }

        const { name, content, shortcut, category } = parsed.data;

        const response = await db.savedResponse.create({
            data: {
                organizationId: session.user.currentOrganizationId,
                name,
                content,
                shortcut: shortcut || null,
                category: category || null,
            },
        });

        return NextResponse.json({ data: response }, { status: 201 });
    } catch (error) {
        if (error instanceof Error && error.message.includes('Unique constraint')) {
            return NextResponse.json(
                { error: 'A response with this name or shortcut already exists' },
                { status: 409 }
            );
        }

        logger.error({ error }, 'Failed to create saved response');
        return NextResponse.json(
            { error: 'Failed to create saved response' },
            { status: 500 }
        );
    }
}
