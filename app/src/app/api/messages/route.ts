import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { sanitizeError } from '@/lib/sanitize-error';

/**
 * Direct Messages API
 *
 * GET /api/messages - List DMs from connected Instagram/Facebook accounts
 *
 * Query params:
 * - platform: 'instagram' | 'facebook' (optional)
 * - isRead: 'true' | 'false' (optional)
 * - page: page number (default 1)
 * - pageSize: items per page (default 20)
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const organizationId = session.user.currentOrganizationId;
        const { searchParams } = new URL(request.url);

        // Parse query params
        const platform = searchParams.get('platform');
        const isRead = searchParams.get('isRead');
        const page = parseInt(searchParams.get('page') || '1', 10);
        const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

        // Build where clause
        const where: Record<string, unknown> = {
            organizationId,
            direction: 'inbound', // Only show incoming messages
        };

        if (platform) {
            where.socialAccount = { platform: platform.toUpperCase() };
        }
        if (isRead !== null && isRead !== undefined) {
            where.isRead = isRead === 'true';
        }

        // Fetch DMs with pagination
        const [messages, total] = await Promise.all([
            db.directMessage.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
                include: {
                    socialAccount: {
                        select: { platform: true, name: true, avatar: true },
                    },
                },
            }),
            db.directMessage.count({ where }),
        ]);

        // Map to expected response format
        const data = messages.map((dm) => ({
            id: dm.id,
            senderName: dm.senderUsername,
            senderAvatar: dm.senderAvatar,
            platform: dm.socialAccount.platform,
            preview: dm.text || '[Media message]',
            isRead: dm.isRead,
            createdAt: dm.createdAt.toISOString(),
            conversationId: dm.conversationId,
            mediaUrl: dm.mediaUrl,
            mediaType: dm.mediaType,
        }));

        return NextResponse.json({
            data,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch direct messages');
        return NextResponse.json(
            { error: sanitizeError(error, 'Failed to fetch messages') },
            { status: 500 }
        );
    }
}
