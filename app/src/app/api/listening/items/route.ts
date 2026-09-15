import { NextRequest, NextResponse } from 'next/server';
import { listeningApi, listeningBody } from '@/lib/services/listening-api';
import { updateListeningItems } from '@/lib/services/listening-management';
import { listeningItemsSchema } from '@/lib/validation/social-listening';

export async function PATCH(request: NextRequest) {
    return listeningApi(true, async (organizationId) => NextResponse.json(
        await updateListeningItems(organizationId, listeningItemsSchema.parse(await listeningBody(request))),
    ));
}
