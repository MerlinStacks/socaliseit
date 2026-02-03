/**
 * Admin Audit Logs API
 * View audit trail of admin actions
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';

/**
 * GET /api/admin/logs
 * List audit log entries with filtering
 */
export const GET = withSuperAdmin(async (request: NextRequest, admin: AdminContext) => {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const action = searchParams.get('action');
    const actorId = searchParams.get('actorId');
    const targetType = searchParams.get('targetType');

    const where = {
        ...(action && { action: { contains: action } }),
        ...(actorId && { actorId }),
        ...(targetType && { targetType }),
    };

    const [logs, total] = await Promise.all([
        db.auditLog.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
        }),
        db.auditLog.count({ where }),
    ]);

    // Fetch actor details for display
    const actorIds = [...new Set(logs.map((l) => l.actorId))];
    const actors = await db.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true },
    });
    const actorMap = new Map(actors.map((a) => [a.id, a]));

    return NextResponse.json({
        logs: logs.map((log) => ({
            id: log.id,
            action: log.action,
            actor: actorMap.get(log.actorId) || { id: log.actorId, name: 'Unknown', email: null },
            targetId: log.targetId,
            targetType: log.targetType,
            metadata: log.metadata,
            ipAddress: log.ipAddress,
            createdAt: log.createdAt,
        })),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    });
});
