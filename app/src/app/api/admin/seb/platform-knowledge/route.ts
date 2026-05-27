import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';
import { parseJsonBody } from '@/lib/parse-json-body';

const BodySchema = z.object({
    platform: z.enum(['INSTAGRAM', 'FACEBOOK', 'META', 'TIKTOK', 'YOUTUBE', 'PINTEREST', 'GOOGLE_BUSINESS', 'LINKEDIN', 'BLUESKY', 'THREADS', 'MANUAL']),
    title: z.string().min(2).max(200),
    content: z.string().min(10).max(10000),
    sourceUrl: z.string().url().optional().or(z.literal('')),
    confidence: z.number().min(0).max(1).optional(),
    isActive: z.boolean().optional(),
});

export const GET = withSuperAdmin(async (_request: NextRequest, _admin: AdminContext) => {
    const items = await db.sebPlatformKnowledge.findMany({ orderBy: { updatedAt: 'desc' }, take: 200 });
    return NextResponse.json({ items });
});

export const POST = withSuperAdmin(async (request: NextRequest, _admin: AdminContext) => {
    const { data: body, error } = await parseJsonBody(request);
    if (error) return error;

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid platform knowledge', details: parsed.error.issues }, { status: 400 });
    }

    const item = await db.sebPlatformKnowledge.create({
        data: {
            ...parsed.data,
            sourceUrl: parsed.data.sourceUrl || null,
            confidence: parsed.data.confidence ?? 0.8,
            isActive: parsed.data.isActive ?? true,
        },
    });

    return NextResponse.json({ item }, { status: 201 });
});
