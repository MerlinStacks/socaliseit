/**
 * Integration Settings API (User-Facing Read-Only)
 * Returns global integration settings status for the user settings page.
 *
 * Why: This endpoint remains as a stub for future third-party integrations.
 * Late.dev has been removed since Pinterest API key was approved directly.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

/**
 * GET /api/settings/integrations
 * Returns integration status. Currently returns empty/unconfigured
 * since Late.dev integration has been removed.
 */
export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({
        isConfigured: false,
    });
}

/**
 * PUT /api/settings/integrations
 * This endpoint is deprecated. Integration settings are managed by super admins.
 */
export async function PUT() {
    return NextResponse.json(
        { error: 'Integration settings are managed by your administrator.' },
        { status: 403 }
    );
}
