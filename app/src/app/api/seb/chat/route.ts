import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parse-json-body';
import { chatWithSeb } from '@/lib/ai/seb-advisor';
import { getSebUsageLimits } from '@/lib/ai/seb-advisor';
import { db } from '@/lib/db';
import { checkRateLimit, EXPENSIVE_RATE_LIMIT, createRateLimitHeaders } from '@/lib/rate-limit';
import { createRouteLogger } from '@/lib/logger';

const log = createRouteLogger('API', '/api/seb/chat');

const BodySchema = z.object({
    sessionId: z.string().optional(),
    message: z.string().min(2).max(2000),
});

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        const organizationId = session?.user?.currentOrganizationId;
        if (!session?.user?.id || !organizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: body, error } = await parseJsonBody(request);
        if (error) return error;

        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid chat request', details: parsed.error.issues }, { status: 400 });
        }

        const rateLimit = await checkRateLimit(`${session.user.id}:seb-chat`, EXPENSIVE_RATE_LIMIT);
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: 'Seb is answering a lot right now. Please try again shortly.' },
                { status: 429, headers: createRateLimitHeaders(rateLimit) },
            );
        }

        const limits = await getSebUsageLimits();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const chatsToday = await db.sebChatMessage.count({
            where: {
                role: 'USER',
                createdAt: { gte: today },
                session: { organizationId, userId: session.user.id },
            },
        });
        if (chatsToday >= limits.maxChatsPerDay) {
            return NextResponse.json({ error: `Seb chat limit reached for today (${limits.maxChatsPerDay}).` }, { status: 429 });
        }

        const result = await chatWithSeb({
            organizationId,
            userId: session.user.id,
            sessionId: parsed.data.sessionId,
            message: parsed.data.message,
        });

        return NextResponse.json({ session: result.session, message: result.message });
    } catch (error) {
        log.error({ err: error }, 'Seb chat failed');
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Seb chat failed' }, { status: 500 });
    }
}
