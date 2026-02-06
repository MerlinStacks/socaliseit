/**
 * Inbox Labels API
 *
 * GET  - List all labels for the organization
 * POST - Create a new label
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const createLabelSchema = z.object({
    name: z.string().min(1).max(50),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

/**
 * List all inbox labels for the organization
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const labels = await db.inboxLabel.findMany({
            where: { organizationId: session.user.currentOrganizationId },
            orderBy: { name: 'asc' },
        });

        return NextResponse.json({ data: labels });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch inbox labels');
        return NextResponse.json(
            { error: 'Failed to fetch labels' },
            { status: 500 }
        );
    }
}

/**
 * Create a new inbox label
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const parsed = createLabelSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request', details: parsed.error.flatten() },
                { status: 400 }
            );
        }

        const { name, color } = parsed.data;

        const label = await db.inboxLabel.create({
            data: {
                organizationId: session.user.currentOrganizationId,
                name,
                color: color || '#6B7280',
            },
        });

        return NextResponse.json({ data: label }, { status: 201 });
    } catch (error) {
        // Handle unique constraint violation
        if (error instanceof Error && error.message.includes('Unique constraint')) {
            return NextResponse.json(
                { error: 'A label with this name already exists' },
                { status: 409 }
            );
        }

        logger.error({ error }, 'Failed to create inbox label');
        return NextResponse.json(
            { error: 'Failed to create label' },
            { status: 500 }
        );
    }
}
