
import { NextRequest, NextResponse } from 'next/server';
import { getOptimalPostingTimes } from '@/lib/ai/smart-scheduling';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import { Platform } from '@/generated/prisma/enums';
import { createRouteLogger } from '@/lib/logger';

export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const organizationId = searchParams.get('organizationId');
        const platform = searchParams.get('platform') as Platform | undefined;

        if (!organizationId) {
            return NextResponse.json({ error: 'Workspace ID required' }, { status: 400 });
        }

        // Call service layer
        const recommendations = await getOptimalPostingTimes(organizationId, platform);

        return NextResponse.json({
            success: true,
            data: recommendations
        });

    } catch (error) {
        createRouteLogger('API', '/api/ai/scheduling/recommendations').error({ err: error }, 'Error fetching scheduling recommendations');
        return NextResponse.json(
            { success: false, error: 'Failed to fetch recommendations' },
            { status: 500 }
        );
    }
}
