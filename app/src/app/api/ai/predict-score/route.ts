import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { predictContentScore, type PredictionInput } from '@/lib/ai/content-prediction';
import { logger } from '@/lib/logger';
import { safeParseJson } from '@/lib/utils';
import { z } from 'zod';

const PredictScoreSchema = z.object({
    caption: z.string().optional().default(''),
    platforms: z.array(z.string()).optional().default([]),
    hashtags: z.array(z.string()).optional().default([]),
    hasMedia: z.boolean().optional().default(false),
    mediaType: z.enum(['image', 'video', 'carousel']).optional(),
    scheduledHour: z.number().int().min(0).max(23).optional(),
    scheduledDayOfWeek: z.number().int().min(0).max(6).optional(),
    postType: z.string().optional(),
});

export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const parseResult = await safeParseJson(req);
        if (!parseResult.ok) {
            return NextResponse.json({ error: parseResult.error }, { status: 400 });
        }
        const data = PredictScoreSchema.parse(parseResult.data);

        const input: PredictionInput = {
            organizationId: session.user.currentOrganizationId,
            caption: data.caption,
            platforms: data.platforms,
            hashtags: data.hashtags,
            hasMedia: data.hasMedia,
            mediaType: data.mediaType,
            scheduledHour: data.scheduledHour,
            scheduledDayOfWeek: data.scheduledDayOfWeek,
            postType: data.postType,
        };

        const result = await predictContentScore(input);

        return NextResponse.json(result);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid request', details: error.issues }, { status: 400 });
        }
        logger.error({ error }, 'Error predicting content score');
        return NextResponse.json({ error: 'Failed to predict content score' }, { status: 500 });
    }
}
