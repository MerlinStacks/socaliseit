import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { predictContentScore, type PredictionInput } from '@/lib/ai/content-prediction';

export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { caption, platforms, hashtags, hasMedia, mediaType, scheduledHour, scheduledDayOfWeek } = body;

        const input: PredictionInput = {
            organizationId: session.user.currentOrganizationId,
            caption: caption || '',
            platforms: platforms || [],
            hashtags: hashtags || [],
            hasMedia: hasMedia || false,
            mediaType,
            scheduledHour,
            scheduledDayOfWeek,
        };

        const result = await predictContentScore(input);

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error predicting content score:', error);
        return NextResponse.json({ error: 'Failed to predict content score' }, { status: 500 });
    }
}
