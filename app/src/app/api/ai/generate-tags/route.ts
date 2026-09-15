/** YouTube tags grounded in Seb's organization context. */
import { NextRequest, NextResponse } from 'next/server';
import { sebErrorResponse } from '@/lib/ai/seb-provider-error';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { generateSebTags } from '@/lib/ai/seb-writing';
import { createRouteLogger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parse-json-body';

const RequestSchema = z.object({
    title: z.string().min(1).max(100),
    description: z.string().max(5000).optional(),
    category: z.string().optional(),
    existingTags: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session.user.currentOrganizationId) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        const { data: body, error } = await parseJsonBody(request);
        if (error) return error;
        const tags = await generateSebTags(session.user.currentOrganizationId, RequestSchema.parse(body));
        return NextResponse.json({ success: true, data: { tags } });
    } catch (error) {
        const providerResponse = sebErrorResponse(error);
        if (providerResponse) return providerResponse;
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, error: 'Invalid request', details: error.issues }, { status: 400 });
        }
        createRouteLogger('API', '/api/ai/generate-tags').error({ err: error }, 'Tag generation error');
        return NextResponse.json({ success: false, error: 'Failed to generate tags' }, { status: 500 });
    }
}
