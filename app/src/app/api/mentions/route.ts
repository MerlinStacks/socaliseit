/**
 * Mentions API
 * List and Sync Mentions/Tags
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { syncAccountMentions } from '@/lib/platform-api/mention-sync';

// GET /api/mentions?type=mention|tag&isRead=false&page=1
export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.user.currentWorkspaceId;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const isRead = searchParams.get('isRead');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = 20;
    const skip = (page - 1) * limit;

    const whereClause: any = { workspaceId };

    if (type && type !== 'all') {
        whereClause.type = type;
    }
    if (isRead !== null && isRead !== undefined && isRead !== 'all') {
        whereClause.isRead = isRead === 'true';
    }

    const [mentions, total] = await Promise.all([
        db.mention.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: skip,
            include: {
                socialAccount: { select: { platform: true, name: true, avatar: true } }
            }
        }),
        db.mention.count({ where: whereClause })
    ]);

    return NextResponse.json({
        data: mentions,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    });
}

// POST /api/mentions/sync
// Body: { accountId: string }
export async function POST(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accountId } = await request.json();

    if (accountId) {
        // Sync specific account
        const account = await db.socialAccount.findFirst({
            where: { id: accountId, workspaceId: session.user.currentWorkspaceId }
        });
        if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

        const result = await syncAccountMentions(accountId);
        return NextResponse.json(result);
    } else {
        // Sync all in workspace
        const accounts = await db.socialAccount.findMany({
            where: { workspaceId: session.user.currentWorkspaceId, isActive: true, platform: { in: ['INSTAGRAM', 'FACEBOOK'] } }
        });
        const results = await Promise.all(accounts.map(acc => syncAccountMentions(acc.id)));
        return NextResponse.json({ results });
    }
}
