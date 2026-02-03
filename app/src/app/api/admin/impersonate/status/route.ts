/**
 * Impersonation Status API
 * Check if the current session is an impersonation
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';

/**
 * GET /api/admin/impersonate/status
 * Returns whether the current session is impersonating a user
 */
export async function GET() {
    const cookieStore = await cookies();
    const impersonatingUserId = cookieStore.get('impersonating_user_id')?.value;
    const originalAdminId = cookieStore.get('original_admin_id')?.value;

    if (!impersonatingUserId || !originalAdminId) {
        return NextResponse.json({ isImpersonating: false });
    }

    // Fetch the impersonated user's info for display
    const targetUser = await db.user.findUnique({
        where: { id: impersonatingUserId },
        select: { id: true, name: true, email: true },
    });

    return NextResponse.json({
        isImpersonating: true,
        targetUser,
    });
}
