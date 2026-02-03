
import { NextRequest, NextResponse } from 'next/server';
import { getOptimalPostingTimes } from '@/lib/ai/smart-scheduling';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import { Platform } from '@/generated/prisma/enums';

export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const workspaceId = searchParams.get('workspaceId');
        const platform = searchParams.get('platform') as Platform | undefined;

        if (!workspaceId) {
            return NextResponse.json({ error: 'Workspace ID required' }, { status: 400 });
        }

        // Call service layer
        const recommendations = await getOptimalPostingTimes(workspaceId, platform);

        return NextResponse.json({
            success: true,
            data: recommendations
        });

    } catch (error) {
        console.error('Error fetching scheduling recommendations:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch recommendations' },
            { status: 500 }
        );
    }
}
