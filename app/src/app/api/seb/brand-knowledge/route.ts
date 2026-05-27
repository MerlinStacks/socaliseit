import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseJsonBody } from '@/lib/parse-json-body';

const BodySchema = z.object({
    audience: z.string().max(5000).optional().nullable(),
    positioning: z.string().max(5000).optional().nullable(),
    products: z.string().max(5000).optional().nullable(),
    offers: z.string().max(5000).optional().nullable(),
    voiceRules: z.string().max(5000).optional().nullable(),
    bannedTopics: z.string().max(5000).optional().nullable(),
});

export async function GET() {
    const session = await auth();
    const organizationId = session?.user?.currentOrganizationId;
    if (!session?.user?.id || !organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const knowledge = await db.sebBrandKnowledge.findUnique({ where: { organizationId } });
    return NextResponse.json({ knowledge });
}

export async function PUT(request: NextRequest) {
    const session = await auth();
    const organizationId = session?.user?.currentOrganizationId;
    if (!session?.user?.id || !organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: body, error } = await parseJsonBody(request);
    if (error) return error;

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid brand knowledge', details: parsed.error.issues }, { status: 400 });
    }

    const knowledge = await db.sebBrandKnowledge.upsert({
        where: { organizationId },
        update: parsed.data,
        create: { organizationId, ...parsed.data },
    });

    return NextResponse.json({ knowledge });
}
