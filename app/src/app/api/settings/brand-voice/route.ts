/**
 * Brand Voice Settings API
 * GET / PUT /api/settings/brand-voice
 *
 * Why: Lets users configure brand tone, guidelines, and sample captions
 * that are fed into all AI features (reply suggestions, caption generation,
 * rewrite). The data is stored in the BrandVoice model, one per organization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createRouteLogger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parse-json-body';

const log = createRouteLogger('API', '/api/settings/brand-voice');

const ToneProfileSchema = z.object({
    formality: z.number().min(0).max(1),
    enthusiasm: z.number().min(0).max(1),
    humor: z.number().min(0).max(1),
    directness: z.number().min(0).max(1),
    emotion: z.number().min(0).max(1),
});

const PutSchema = z.object({
    toneProfile: ToneProfileSchema.optional(),
    guidelines: z.string().max(2000).optional(),
    samples: z.array(z.string().max(2200)).max(5).optional(),
    emojiStyle: z.enum(['none', 'minimal', 'moderate', 'heavy']).optional(),
    hashtagStyle: z.enum(['none', 'minimal', 'moderate', 'heavy']).optional(),
});

/**
 * GET /api/settings/brand-voice
 * Returns the brand voice config for the current user's organization.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const brandVoice = await db.brandVoice.findUnique({
            where: { organizationId: session.user.currentOrganizationId },
        });

        return NextResponse.json({
            success: true,
            data: brandVoice
                ? {
                    toneProfile: brandVoice.toneProfile,
                    guidelines: brandVoice.guidelines,
                    samples: brandVoice.samples,
                }
                : null,
        });
    } catch (error) {
        log.error({ err: error }, 'Failed to fetch brand voice');
        return NextResponse.json(
            { error: 'Failed to fetch brand voice settings' },
            { status: 500 },
        );
    }
}

/**
 * PUT /api/settings/brand-voice
 * Upserts the brand voice for the current organization.
 */
export async function PUT(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: body, error: parseError } = await parseJsonBody(request);
        if (parseError) return parseError;

        const data = PutSchema.parse(body);
        const orgId = session.user.currentOrganizationId;

        // Build the toneProfile JSON that includes vocabulary prefs
        const toneJson: Record<string, string | number> = {};
        if (data.toneProfile) {
            Object.assign(toneJson, data.toneProfile);
        }
        if (data.emojiStyle) toneJson.emojiStyle = data.emojiStyle;
        if (data.hashtagStyle) toneJson.hashtagStyle = data.hashtagStyle;

        const brandVoice = await db.brandVoice.upsert({
            where: { organizationId: orgId },
            create: {
                organizationId: orgId,
                toneProfile: Object.keys(toneJson).length > 0 ? (toneJson as Prisma.InputJsonValue) : undefined,
                guidelines: data.guidelines ?? '',
                samples: data.samples ?? [],
            },
            update: {
                toneProfile: Object.keys(toneJson).length > 0 ? (toneJson as Prisma.InputJsonValue) : undefined,
                guidelines: data.guidelines,
                samples: data.samples,
            },
        });

        log.info({ orgId }, 'Brand voice settings updated');

        return NextResponse.json({
            success: true,
            data: {
                toneProfile: brandVoice.toneProfile,
                guidelines: brandVoice.guidelines,
                samples: brandVoice.samples,
            },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid request', details: error.issues },
                { status: 400 },
            );
        }
        log.error({ err: error }, 'Failed to update brand voice');
        return NextResponse.json(
            { error: 'Failed to save brand voice settings' },
            { status: 500 },
        );
    }
}
