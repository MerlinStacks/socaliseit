import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { predictContentScore, type PredictionInput } from '@/lib/ai/content-prediction';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { caption, platforms, hashtags, hasMedia, mediaType, scheduledHour, scheduledDayOfWeek, postType } = body;

        const input: PredictionInput = {
            organizationId: session.user.currentOrganizationId,
            caption: caption || '',
            platforms: platforms || [],
            hashtags: hashtags || [],
            hasMedia: hasMedia || false,
            mediaType,
            scheduledHour,
            scheduledDayOfWeek,
            postType,
        };

        const result = await predictContentScore(input);

        return NextResponse.json(result);
    } catch (error) {
        logger.error({ error }, 'Error predicting content score');
        return NextResponse.json({ error: 'Failed to predict content score' }, { status: 500 });
    }
}
