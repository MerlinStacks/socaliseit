import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const notifications = await db.notification.findMany({
            where: {
                organizationId: session.user.currentOrganizationId,
                isRead: false,
                OR: [
                    { userId: session.user.id },
                    { userId: null }
                ]
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: 20
        });

        // Also get the total unread count (we might just use length but good to have)
        return NextResponse.json({ notifications, count: notifications.length });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const body = await request.json();
        const { notificationIds } = body;

        if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
            return NextResponse.json({ success: true });
        }

        await db.notification.updateMany({
            where: {
                id: { in: notificationIds },
                organizationId: session.user.currentOrganizationId,
                OR: [
                    { userId: session.user.id },
                    { userId: null }
                ]
            },
            data: {
                isRead: true
            }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating notifications:', error);
        return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 });
    }
}
