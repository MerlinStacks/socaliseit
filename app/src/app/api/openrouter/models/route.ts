/** Authenticated view of the shared public capability catalogue. */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSebModels } from '@/lib/ai/openrouter-models';
import { sebErrorResponse } from '@/lib/ai/seb-provider-error';

export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
        const query = request.nextUrl.searchParams.get('search')?.toLowerCase() || '';
        const target = request.nextUrl.searchParams.get('target');
        const models = (await getSebModels()).filter(model =>
            (target !== 'seb' || model.supportsImageInput) &&
            (!query || [model.id, model.name, model.description].some(value => value.toLowerCase().includes(query))));
        return NextResponse.json({ models });
    } catch (error) {
        return sebErrorResponse(error) ?? NextResponse.json({ error: 'Failed to fetch models' }, { status: 503 });
    }
}
