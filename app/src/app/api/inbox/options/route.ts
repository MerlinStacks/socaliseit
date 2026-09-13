import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const organizationId = session.user.currentOrganizationId;
        const [accounts, members, labels] = await Promise.all([
            db.socialAccount.findMany({ where: { organizationId }, select: { id: true, name: true, platform: true }, orderBy: { name: 'asc' } }),
            db.organizationMember.findMany({ where: { organizationId }, select: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: 'asc' } } }),
            db.inboxLabel.findMany({ where: { organizationId }, select: { id: true, name: true, color: true }, orderBy: { name: 'asc' } }),
        ]);
        return NextResponse.json({ accounts, members: members.map(({ user }) => ({ id: user.id, name: user.name ?? 'Unnamed member' })), labels });
    } catch (error) {
        logger.error({ error }, 'Inbox options fetch failed');
        return NextResponse.json({ error: 'Failed to fetch inbox options' }, { status: 500 });
    }
}
