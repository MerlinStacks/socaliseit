import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseJsonBody } from '@/lib/parse-json-body';

const BodySchema = z.object({
    status: z.enum(['PLANNED', 'RUNNING', 'COMPLETED', 'CANCELLED']),
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
    if (!parsed.success) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });

    const existing = await db.sebExperiment.findFirst({ where: { id, organizationId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const experiment = await db.sebExperiment.update({
        where: { id },
        data: {
            status: parsed.data.status,
            startAt: parsed.data.status === 'RUNNING' && !existing.startAt ? new Date() : existing.startAt,
            endAt: parsed.data.status === 'COMPLETED' ? new Date() : existing.endAt,
        },
    });

    return NextResponse.json({ experiment });
}
