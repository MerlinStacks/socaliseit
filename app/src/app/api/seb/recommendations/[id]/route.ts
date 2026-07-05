import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { invalidatePostCaches } from '@/lib/cache';
import { parseJsonBody } from '@/lib/parse-json-body';

const BodySchema = z.object({
    status: z.enum(['NEW', 'IN_PROGRESS', 'DONE', 'DISMISSED']),
});

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const session = await auth();
    const organizationId = session?.user?.currentOrganizationId;
    if (!session?.user?.id || !organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await props.params;
    const { data: body, error } = await parseJsonBody(request);
    if (error) return error;

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid status', details: parsed.error.issues }, { status: 400 });
    }

    const existing = await db.sebRecommendation.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const recommendation = await db.sebRecommendation.update({
        where: { id },
        data: {
            status: parsed.data.status,
            completedAt: parsed.data.status === 'DONE' ? new Date() : null,
        },
    });

    invalidatePostCaches(organizationId);

    return NextResponse.json({ recommendation });
}
