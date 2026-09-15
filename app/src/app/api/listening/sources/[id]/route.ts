import { NextRequest, NextResponse } from 'next/server';
import { listeningApi, listeningBody } from '@/lib/services/listening-api';
import { updateListeningSource } from '@/lib/services/listening-management';
import { updateSourceSchema } from '@/lib/validation/social-listening';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    return listeningApi(true, async (organizationId) => {
        const { id } = await params;
        const input = updateSourceSchema.parse(await listeningBody(request));
        return NextResponse.json({ source: await updateListeningSource(organizationId, id, input) });
    });
}
