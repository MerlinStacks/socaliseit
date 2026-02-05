/**
 * Sidebar Badges API
 * Returns notification counts for sidebar nav items
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // TODO: Implement actual counts from database
        // For now, return sample data
        const badges = {
            drafts: 0,
            scheduled: 0,
            failed: 0,
            engagement: 0,
            analytics: 0,
        };

        // These would be actual queries like:
        // badges.drafts = await prisma.post.count({ where: { userId: session.user.id, status: 'draft' } });
        // badges.failed = await prisma.post.count({ where: { userId: session.user.id, status: 'failed' } });

        return NextResponse.json({ badges });
    } catch (error) {
        console.error('Failed to fetch badges:', error);
        return NextResponse.json(
            { error: 'Failed to fetch badges' },
            { status: 500 }
        );
    }
}
