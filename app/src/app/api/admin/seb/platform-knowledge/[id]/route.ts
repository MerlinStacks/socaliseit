import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';
import { parseJsonBody } from '@/lib/parse-json-body';

const BodySchema = z.object({
    isActive: z.boolean().optional(),
    title: z.string().min(2).max(200).optional(),
    content: z.string().min(10).max(10000).optional(),
    sourceUrl: z.string().url().optional().or(z.literal('')),
    confidence: z.number().min(0).max(1).optional(),
});

export const PATCH = withSuperAdmin(async (request: NextRequest, _admin: AdminContext) => {
    const id = request.nextUrl.pathname.split('/').pop();
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const { data: body, error } = await parseJsonBody(request);
    if (error) return error;
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid platform knowledge' }, { status: 400 });

    const item = await db.sebPlatformKnowledge.update({
        where: { id },
        data: { ...parsed.data, sourceUrl: parsed.data.sourceUrl || undefined },
    });
    return NextResponse.json({ item });
});
