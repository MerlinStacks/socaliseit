/**
 * Super Admin Middleware Guard
 * Protects admin API routes - only users with isSuperAdmin flag can access
 */

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export interface AdminContext {
    userId: string;
    email: string;
    name?: string | null;
}

/**
 * Validates that the current user is a super admin.
 * Returns the admin context if valid, or a 403 response if not.
 */
export async function requireSuperAdmin(
    request?: NextRequest
): Promise<{ success: true; admin: AdminContext } | { success: false; response: NextResponse }> {
    const session = await auth();

    if (!session?.user?.id) {
        return {
            success: false,
            response: NextResponse.json(
                { error: 'Unauthorized', message: 'Authentication required' },
                { status: 401 }
            ),
        };
    }

    // Fetch fresh user data to check isSuperAdmin flag
    const user = await db.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, email: true, name: true, isSuperAdmin: true },
    });

    if (!user) {
        return {
            success: false,
            response: NextResponse.json(
                { error: 'Unauthorized', message: 'User not found' },
                { status: 401 }
            ),
        };
    }

    if (!user.isSuperAdmin) {
        return {
            success: false,
            response: NextResponse.json(
                { error: 'Forbidden', message: 'Super admin access required' },
                { status: 403 }
            ),
        };
    }

    return {
        success: true,
        admin: {
            userId: user.id,
            email: user.email,
            name: user.name,
        },
    };
}

/**
 * Helper to wrap an admin API handler with super admin protection.
 * Usage:
 *   export const GET = withSuperAdmin(async (request, admin) => {
 *       // Handler code - admin is guaranteed to be a super admin
 *   });
 */
export function withSuperAdmin(
    handler: (request: NextRequest, admin: AdminContext) => Promise<NextResponse>
) {
    return async (request: NextRequest): Promise<NextResponse> => {
        const result = await requireSuperAdmin(request);

        if (!result.success) {
            return result.response;
        }

        return handler(request, result.admin);
    };
}
