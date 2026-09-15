import { NextRequest, NextResponse } from 'next/server';
import { listeningApi, listeningBody } from '@/lib/services/listening-api';
import { createListeningSource } from '@/lib/services/listening-management';
import { createSourceSchema } from '@/lib/validation/social-listening';

export async function POST(request: NextRequest) {
    return listeningApi(true, async (organizationId) => {
        const input = createSourceSchema.parse(await listeningBody(request));
        return NextResponse.json({ source: await createListeningSource(organizationId, input) }, { status: 201 });
    });
}
