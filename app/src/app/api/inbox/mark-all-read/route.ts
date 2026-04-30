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

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const organizationId = session.user.currentOrganizationId;
        const body = await request.json().catch(() => ({}));
        const type = body.type || 'all';
        const platform = body.platform || null;

        /** Why: Run all updates in parallel for speed */
        const updates: Promise<unknown>[] = [];

        const buildWhere = (extras: Record<string, unknown> = {}) => {
            const where: Record<string, unknown> = { organizationId, isRead: false, ...extras };
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

        const results = await Promise.all(updates);
        const totalMarked = results.reduce((sum: number, r) => {
            if (r && typeof r === 'object' && 'count' in r) {
                return sum + (r as { count: number }).count;
            }
            return sum;
        }, 0);

        return NextResponse.json({ success: true, marked: totalMarked });
    } catch (error) {
        logger.error({ error }, 'Mark all read failed');
        return NextResponse.json(
            { error: sanitizeError(error, 'Failed to mark all read') },
            { status: 500 }
        );
    }
}
