/**
 * Admin Webhook Events API
 *
 * Why: Exposes processed Stripe webhook events so Super Admins
 * can inspect delivery status and debug payment issues.
 * Supports pagination and optional filtering by event ID prefix.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';

export const GET = withSuperAdmin(async (request: NextRequest, _admin: AdminContext) => {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '25', 10);
    const search = searchParams.get('search') || '';

    const where = search
        ? { eventId: { contains: search, mode: 'insensitive' as const } }
        : {};

    const [events, total] = await Promise.all([
        db.processedWebhookEvent.findMany({
            where,
            orderBy: { processedAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
        }),
        db.processedWebhookEvent.count({ where }),
    ]);

    return NextResponse.json({
        events: events.map((e) => ({
            eventId: e.eventId,
            processedAt: e.processedAt,
        })),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    });
});
