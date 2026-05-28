import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parse-json-body';
import { scanWebsiteForSebBrandKnowledge } from '@/lib/ai/seb-advisor';
import { createRouteLogger } from '@/lib/logger';

const BodySchema = z.object({
    websiteUrl: z.string().max(2000).optional().nullable(),
});

export async function POST(request: NextRequest) {
    const session = await auth();
    const organizationId = session?.user?.currentOrganizationId;
    if (!session?.user?.id || !organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: body, error } = await parseJsonBody(request);
    if (error) return error;

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid website scan request', details: parsed.error.issues }, { status: 400 });
    }

    try {
        const result = await scanWebsiteForSebBrandKnowledge({
            organizationId,
            websiteUrl: parsed.data.websiteUrl || undefined,
        });
        return NextResponse.json(result);
    } catch (err) {
        createRouteLogger('API', '/api/seb/brand-knowledge/scan').warn({ err, organizationId }, 'Seb website scan failed');
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Failed to scan website' },
            { status: 400 }
        );
    }
}
