import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST() {
    const session = await auth();
    const organizationId = session?.user?.currentOrganizationId;
    if (!session?.user?.id || !organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const existing = await db.sebBrandKnowledge.findUnique({ where: { organizationId } });
    if (!existing?.pendingInsights) {
        return NextResponse.json({ knowledge: existing, message: 'No pending Seb insights to approve' });
    }

    const previous = existing.learnedInsights && typeof existing.learnedInsights === 'object' ? existing.learnedInsights : {};
    const pending = existing.pendingInsights && typeof existing.pendingInsights === 'object' ? existing.pendingInsights : {};
    const knowledge = await db.sebBrandKnowledge.update({
        where: { organizationId },
        data: {
            learnedInsights: { ...previous, ...pending },
            pendingInsights: undefined,
        },
    });

    return NextResponse.json({ knowledge });
}
