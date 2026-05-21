import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

export interface OrganizationAccessContext {
    userId: string;
    organizationId: string;
    role: string;
}

export async function requireCurrentOrganizationAccess(): Promise<
    { ok: true; ctx: OrganizationAccessContext } | { ok: false; response: NextResponse }
> {
    const session = await getSession();
    const userId = session?.user?.id;
    const organizationId = session?.user?.currentOrganizationId;

    if (!userId || !organizationId) {
        return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }

    const membership = await db.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        select: { role: true },
    });

    if (!membership) {
        return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }

    return { ok: true, ctx: { userId, organizationId, role: membership.role } };
}

export function requireOwnerOrAdmin(ctx: OrganizationAccessContext): NextResponse | null {
    if (ctx.role === 'OWNER' || ctx.role === 'ADMIN') return null;
    return NextResponse.json({ error: 'Owner or admin access required' }, { status: 403 });
}
