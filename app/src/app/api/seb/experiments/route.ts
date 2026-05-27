import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
    const session = await auth();
    const organizationId = session?.user?.currentOrganizationId;
    if (!session?.user?.id || !organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const experiments = await db.sebExperiment.findMany({
        where: { organizationId },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: 50,
    });

    return NextResponse.json({ experiments });
}
