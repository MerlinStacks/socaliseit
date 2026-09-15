import { NextRequest, NextResponse } from 'next/server';
import { listeningApi, listeningBody } from '@/lib/services/listening-api';
import { createListeningMonitor } from '@/lib/services/social-listening';
import { createMonitorSchema } from '@/lib/validation/social-listening';

export async function POST(request: NextRequest) {
    return listeningApi(true, async (organizationId) => {
        const input = createMonitorSchema.parse(await listeningBody(request));
        const monitor = await createListeningMonitor(organizationId, { ...input, name: input.name ?? input.keywords[0] });
        return NextResponse.json({ monitor }, { status: 201 });
    });
}
