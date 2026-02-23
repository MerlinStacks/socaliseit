/**
 * Admin User Ban API
 *
 * Why: Allows Super Admins to permanently ban bad actors.
 * Banned users cannot log in (blocked at signIn callback)
 * and their existing sessions are invalidated.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';
import { invalidateSessionCache } from '@/lib/auth';
import { logger } from '@/lib/logger';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/users/[id]/ban
 * Ban a user — sets bannedAt and destroys all sessions
 */
export const POST = async (request: NextRequest, context: RouteContext) => {
    const handler = withSuperAdmin(async (req: NextRequest, admin: AdminContext) => {
        const { id } = await context.params;
        const body = await req.json().catch(() => ({}));
        const reason = body.reason || 'Banned by admin';

        // Prevent self-ban
        if (id === admin.userId) {
            return NextResponse.json(
                { error: 'Cannot ban yourself' },
                { status: 400 }
            );
        }

        const user = await db.user.findUnique({
            where: { id },
            select: { isSuperAdmin: true, bannedAt: true },
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        if (user.isSuperAdmin) {
            return NextResponse.json(
                { error: 'Cannot ban Super Admin users' },
                { status: 403 }
            );
        }

        await db.$transaction([
            // Set ban fields
            db.user.update({
                where: { id },
                data: { bannedAt: new Date(), banReason: reason },
            }),
            // Destroy all sessions — forces immediate logout
            db.session.deleteMany({ where: { userId: id } }),
        ]);

        // Evict from in-memory session cache
        invalidateSessionCache(id);

        logger.info({ userId: id, reason, adminId: admin.userId }, '[admin] User banned');

        return NextResponse.json({ success: true, message: 'User banned' });
    });

    return handler(request);
};

/**
 * DELETE /api/admin/users/[id]/ban
 * Unban a user — clears bannedAt
 */
export const DELETE = async (request: NextRequest, context: RouteContext) => {
    const handler = withSuperAdmin(async (req: NextRequest, admin: AdminContext) => {
        const { id } = await context.params;

        const user = await db.user.findUnique({
            where: { id },
            select: { bannedAt: true },
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        if (!user.bannedAt) {
            return NextResponse.json({ error: 'User is not banned' }, { status: 400 });
        }

        await db.user.update({
            where: { id },
            data: { bannedAt: null, banReason: null },
        });

        logger.info({ userId: id, adminId: admin.userId }, '[admin] User unbanned');

        return NextResponse.json({ success: true, message: 'User unbanned' });
    });

    return handler(request);
};
