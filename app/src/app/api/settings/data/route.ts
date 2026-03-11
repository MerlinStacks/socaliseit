/**
 * Settings Data API Route
 * Why: The SPA shell fetches this endpoint for client-side settings rendering.
 * Mirrors the data shape produced by settings-data.tsx (server component).
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

/** GET /api/settings/data */
export async function GET() {
    const session = await auth();

    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const [organization, user] = await Promise.all([
            session.user.currentOrganizationId
                ? db.organization.findUnique({
                    where: { id: session.user.currentOrganizationId },
                })
                : null,
            db.user.findUnique({
                where: { id: session.user.id },
            }),
        ]);

        return NextResponse.json({
            user: {
                id: session.user.id,
                name: user?.name || session.user.name || '',
                email: user?.email || session.user.email || '',
                image: user?.image || session.user.image || null,
            },
            organization: {
                id: organization?.id || '',
                name: organization?.name || 'My Organization',
                slug: organization?.slug || '',
                logo: organization?.logo || null,
                timezone: organization?.timezone || 'Australia/Sydney',
                aiDraftsEnabled: organization?.aiDraftsEnabled ?? true,
            },
        }, {
            headers: {
                'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
            },
        });
    } catch (error) {
        logger.error({ error, userId: session.user.id }, 'Failed to fetch settings data');
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
}
