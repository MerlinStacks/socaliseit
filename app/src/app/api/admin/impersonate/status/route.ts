/**
 * Impersonation Status API
 * Check if the current session is an impersonation
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/admin/middleware';

/**
 * GET /api/admin/impersonate/status
 * Returns whether the current session is impersonating a user
 */
export async function GET() {
    const admin = await requireSuperAdmin();
    if (!admin.success) return admin.response;

    const cookieStore = await cookies();
    const impersonatingUserId = cookieStore.get('impersonating_user_id')?.value;
    const originalAdminId = cookieStore.get('original_admin_id')?.value;

    if (!impersonatingUserId || !originalAdminId) {
        return NextResponse.json({ isImpersonating: false });
    }

    if (originalAdminId !== admin.admin.userId) {
        return NextResponse.json({ isImpersonating: false }, { status: 403 });
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
