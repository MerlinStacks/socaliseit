import { NextRequest, NextResponse } from 'next/server';
import { listeningApi } from '@/lib/services/listening-api';
import { getListeningDashboard } from '@/lib/services/social-listening';
import { listeningQuerySchema } from '@/lib/validation/social-listening';

export async function GET(request: NextRequest) {
    return listeningApi(false, async (organizationId) => {
        const query = listeningQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
        const dashboard = await getListeningDashboard(organizationId, query);
        return NextResponse.json({ ...dashboard, hasInstagram: dashboard.platforms.includes('INSTAGRAM') }, {
            headers: { 'Cache-Control': 'private, no-store' },
        });
    });
}
