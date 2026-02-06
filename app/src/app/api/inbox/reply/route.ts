/**
 * Reply to Inbox Item API
 * POST /api/inbox/reply
 *
 * Sends a reply to a DM conversation or comment thread.
 * Routes to appropriate platform API based on type.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { sendDMReply } from '@/lib/platform-api/dm-sync';

const RequestSchema = z.object({
    type: z.enum(['dm', 'comment']),
    conversationId: z.string(),
    socialAccountId: z.string(),
    recipientId: z.string().optional(),
    text: z.string().min(1).max(5000),
});

export async function POST(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const organizationId = session.user.currentOrganizationId;

        const body = await request.json();
        const data = RequestSchema.parse(body);

        // Verify social account belongs to organization
        const account = await db.socialAccount.findFirst({
            where: {
                id: data.socialAccountId,
                organizationId,
            },
        });

        if (!account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }

        if (data.type === 'dm') {
            if (!data.recipientId) {
                return NextResponse.json({ error: 'recipientId required for DM reply' }, { status: 400 });
            }

            // Send via platform API
            const result = await sendDMReply(data.socialAccountId, data.recipientId, data.text);

            if (!result.success) {
                return NextResponse.json(
                    { error: result.error || 'Failed to send DM' },
                    { status: 500 }
                );
            }

            logger.info(
                { messageId: result.messageId, recipientId: data.recipientId },
                'DM reply sent'
            );

            return NextResponse.json({
                success: true,
                data: { messageId: result.messageId },
            });
        }

        if (data.type === 'comment') {
            // For comments, we need to call the platform's comment reply API
            // This varies by platform - for now, store the intent and mark as TODO

            // Find the parent comment
            const parentComment = await db.comment.findFirst({
                where: {
                    organizationId,
                    OR: [
                        { id: data.conversationId },
                        { platformCommentId: data.conversationId },
                    ],
                },
                include: {
                    socialAccount: true,
                },
            });

            if (!parentComment) {
                return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
            }

            // Call platform-specific reply API
            // TODO: Implement per-platform comment reply
            // For now, log the intent and return success
            logger.info(
                {
                    platform: account.platform,
                    parentCommentId: parentComment.platformCommentId,
                    replyText: data.text.slice(0, 50),
                },
                'Comment reply requested (platform API not yet implemented)'
            );

            // Create a placeholder reply record
            const reply = await db.comment.create({
                data: {
                    organizationId,
                    socialAccountId: account.id,
                    platformPostId: parentComment.platformPostId,
                    platformCommentId: `pending_${Date.now()}`,
                    authorId: account.platformId,
                    authorUsername: account.name || 'You',
                    authorAvatar: account.avatar,
                    text: data.text,
                    parentId: parentComment.id,
                    isReplied: true,
                    createdAt: new Date(),
                },
            });

            return NextResponse.json({
                success: true,
                data: {
                    replyId: reply.id,
                    status: 'pending', // Will be sent when platform API is implemented
                },
            });
        }

        return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid request', details: error.issues },
                { status: 400 }
            );
        }

        logger.error({ error }, 'Reply send error');
        return NextResponse.json(
            { error: 'Failed to send reply' },
            { status: 500 }
        );
    }
}
