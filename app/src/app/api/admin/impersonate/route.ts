/**
 * Admin Impersonation API
 * Allows super admins to log in as any user for troubleshooting
 */

import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';
import { recordAuditLog, AUDIT_ACTIONS } from '@/lib/admin/audit';

/**
 * POST /api/admin/impersonate
 * Start impersonating a user
 */
export const POST = withSuperAdmin(async (request: NextRequest, admin: AdminContext) => {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
        return NextResponse.json(
            { error: 'Bad Request', message: 'userId is required' },
            { status: 400 }
        );
    }

    // Cannot impersonate yourself
    if (userId === admin.userId) {
        return NextResponse.json(
            { error: 'Bad Request', message: 'Cannot impersonate yourself' },
            { status: 400 }
        );
    }

    // Verify target user exists
    const targetUser = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, isSuperAdmin: true },
    });

    if (!targetUser) {
        return NextResponse.json(
            { error: 'Not Found', message: 'User not found' },
            { status: 404 }
        );
    }

    // Cannot impersonate another super admin
    if (targetUser.isSuperAdmin) {
        return NextResponse.json(
            { error: 'Forbidden', message: 'Cannot impersonate another super admin' },
            { status: 403 }
        );
    }

    // Record the impersonation in audit log
    await recordAuditLog({
        action: AUDIT_ACTIONS.IMPERSONATE_START,
        actorId: admin.userId,
        targetId: userId,
        targetType: 'user',
        metadata: { targetEmail: targetUser.email, targetName: targetUser.name },
        request,
    });

    // Set impersonation cookies
    const cookieStore = await cookies();
    cookieStore.set('impersonating_user_id', userId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 2, // 2 hours max
        path: '/',
    });
    cookieStore.set('original_admin_id', admin.userId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 2,
        path: '/',
    });

    return NextResponse.json({
        success: true,
        message: `Now impersonating ${targetUser.name || targetUser.email}`,
        impersonating: {
            id: targetUser.id,
            name: targetUser.name,
            email: targetUser.email,
        },
    });
});

/**
 * DELETE /api/admin/impersonate
 * Stop impersonating and return to admin account
 */
export const DELETE = async (request: NextRequest) => {
    const cookieStore = await cookies();
    const originalAdminId = cookieStore.get('original_admin_id')?.value;
    const impersonatingUserId = cookieStore.get('impersonating_user_id')?.value;

    if (!originalAdminId || !impersonatingUserId) {
        return NextResponse.json(
            { error: 'Bad Request', message: 'Not currently impersonating anyone' },
            { status: 400 }
        );
    }

    // Record end of impersonation
    await recordAuditLog({
        action: AUDIT_ACTIONS.IMPERSONATE_END,
        actorId: originalAdminId,
        targetId: impersonatingUserId,
        targetType: 'user',
        request,
    });

    // Clear impersonation cookies
    cookieStore.delete('impersonating_user_id');
    cookieStore.delete('original_admin_id');

    return NextResponse.json({
        success: true,
        message: 'Impersonation ended',
    });
};
