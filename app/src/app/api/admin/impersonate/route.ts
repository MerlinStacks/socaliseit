/**
 * Admin Impersonation API
 * Allows super admins to log in as any user for troubleshooting
 */

import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { safeParseJson } from '@/lib/utils';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';
import { recordAuditLog, AUDIT_ACTIONS } from '@/lib/admin/audit';
import { checkRateLimit, createRateLimitHeaders, EXPENSIVE_RATE_LIMIT } from '@/lib/rate-limit';

/**
 * POST /api/admin/impersonate
 * Start impersonating a user
 */
export const POST = withSuperAdmin(async (request: NextRequest, admin: AdminContext) => {
    const rateLimitResult = await checkRateLimit(`${admin.userId}:admin-impersonate`, EXPENSIVE_RATE_LIMIT);
    if (!rateLimitResult.allowed) {
        return NextResponse.json(
            { error: 'Too many impersonation attempts. Please try again later.' },
            { status: 429, headers: createRateLimitHeaders(rateLimitResult) }
        );
    }

    const parseResult = await safeParseJson(request);
    if (!parseResult.ok) {
        return NextResponse.json({ error: parseResult.error }, { status: 400 });
    }
    const body = parseResult.data;
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
        where: { id: userId as string },
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
        targetId: userId as string,
        targetType: 'user',
        metadata: { targetEmail: targetUser.email, targetName: targetUser.name },
        request,
    });

    // Set impersonation cookies
    const cookieStore = await cookies();
    cookieStore.set('impersonating_user_id', userId as string, {
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
 *
 * Why (BUG-03): Previously had no auth guard — only checked cookie presence.
 * An attacker could forge cookies and manipulate the audit log. Now verifies
 * the caller's session matches the original admin stored in the cookie.
 */
export const DELETE = withSuperAdmin(async (request: NextRequest, admin: AdminContext) => {
    const cookieStore = await cookies();
    const originalAdminId = cookieStore.get('original_admin_id')?.value;
    const impersonatingUserId = cookieStore.get('impersonating_user_id')?.value;

    if (!originalAdminId || !impersonatingUserId) {
        return NextResponse.json(
            { error: 'Bad Request', message: 'Not currently impersonating anyone' },
            { status: 400 }
        );
    }

    // Verify the authenticated super admin matches the original admin who started impersonation
    if (admin.userId !== originalAdminId) {
        return NextResponse.json(
            { error: 'Forbidden', message: 'Only the admin who started impersonation can end it' },
            { status: 403 }
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
});
