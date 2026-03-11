import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { addDays } from 'date-fns';
import { logger } from '@/lib/logger';

// Vercel cron configuration
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    // Basic auth check for cron
    const authHeader = request.headers.get('authorization');
    if (
        process.env.CRON_SECRET &&
        authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    try {
        const now = new Date();
        const twoWeeksFromNow = addDays(now, 14);

        // Find all draft posts scheduled within 14 days that are missing content
        const problemPosts = await db.post.findMany({
            where: {
                status: 'DRAFT',
                scheduledAt: {
                    gte: now,
                    lte: twoWeeksFromNow,
                },
                OR: [
                    { caption: '' },
                    { media: { none: {} } }
                ]
            },
            select: {
                id: true,
                organizationId: true,
            }
        });

        // Group by organization
        const orgAlerts = problemPosts.reduce((acc, post) => {
            if (!acc[post.organizationId]) {
                acc[post.organizationId] = [];
            }
            acc[post.organizationId].push(post);
            return acc;
        }, {} as Record<string, typeof problemPosts>);

        const notificationsToCreate = [];

        for (const [orgId, posts] of Object.entries(orgAlerts)) {
            // Delete any unread notifications of this exact type to avoid spamming duplicates
            await db.notification.deleteMany({
                where: {
                    organizationId: orgId,
                    type: 'alert',
                    title: 'Action Needed: Missing Content',
                    isRead: false
                }
            });

            notificationsToCreate.push({
                organizationId: orgId,
                title: 'Action Needed: Missing Content',
                message: `You have ${posts.length} placeholder${posts.length > 1 ? 's' : ''} in the next 14 days missing a caption or media.`,
                type: 'alert',
                link: '/dashboard', // Links to the dashboard where the widget will be
            });
        }

        if (notificationsToCreate.length > 0) {
            await db.notification.createMany({
                data: notificationsToCreate,
            });
        }

        return NextResponse.json({
            success: true,
            alertedOrgs: notificationsToCreate.length,
            totalAlertedPosts: problemPosts.length
        });

    } catch (error) {
        logger.error({ error }, 'Error scanning content alerts');
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
