/**
 * Mark All Read API
 * POST /api/inbox/mark-all-read
 *
 * Why: Bulk action to mark all inbox items as read for quick triage.
 * Accepts optional filters to scope which items get marked.
 *
 * Body params:
 * - type: 'all' | 'comment' | 'mention' | 'dm' (default: 'all')
 * - platform: optional platform filter
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { sanitizeError } from '@/lib/sanitize-error';
import { z } from 'zod';
import { Platform } from '@/generated/prisma/client';
import { parseJsonBody } from '@/lib/parse-json-body';

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const organizationId = session.user.currentOrganizationId;
        const { data: body, error: parseError } = await parseJsonBody(request);
        if (parseError) return parseError;
        const { type, platform, socialAccountId } = z.object({
            type: z.enum(['all', 'comment', 'mention', 'dm', 'review']).default('all'),
            platform: z.string().transform((v) => v.toUpperCase()).pipe(z.enum(Platform)).optional(),
            socialAccountId: z.string().min(1).optional(),
        }).parse(body);

        /** Why: Run all updates in parallel for speed */
        const updates: Promise<unknown>[] = [];

        const buildWhere = (extras: Record<string, unknown> = {}) => {
            const where: Record<string, unknown> = { organizationId, socialAccountId, isRead: false, ...extras };
            if (platform) {
                where.socialAccount = { platform: platform.toUpperCase() };
            }
            return where;
        };

        if (type === 'all' || type === 'comment') {
            updates.push(
                db.comment.updateMany({
                    where: buildWhere(),
                    data: { isRead: true },
                })
            );
        }

        if (type === 'all' || type === 'mention') {
            updates.push(
                db.mention.updateMany({
                    where: buildWhere(),
                    data: { isRead: true },
                })
            );
        }

        if (type === 'all' || type === 'dm') {
            updates.push(
                db.directMessage.updateMany({
                    where: buildWhere({ direction: 'inbound' }),
                    data: { isRead: true },
                })
            );
        }

        if (type === 'all' || type === 'review') {
            updates.push(db.review.updateMany({ where: buildWhere(), data: { isRead: true } }));
        }
        const results = await Promise.all(updates);
        const totalMarked = results.reduce((sum: number, r) => {
            if (r && typeof r === 'object' && 'count' in r) {
                return sum + (r as { count: number }).count;
            }
            return sum;
        }, 0);

        return NextResponse.json({ success: true, marked: totalMarked });
    } catch (error) {
        if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid request', details: error.issues }, { status: 400 });
        logger.error({ error }, 'Mark all read failed');
        return NextResponse.json(
            { error: sanitizeError(error, 'Failed to mark all read') },
            { status: 500 }
        );
    }
}
