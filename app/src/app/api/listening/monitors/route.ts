import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createListeningMonitor } from '@/lib/services/social-listening';
import type { Platform } from '@/generated/prisma/client';

const PLATFORM_VALUES = new Set(['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'YOUTUBE', 'PINTEREST', 'GOOGLE_BUSINESS', 'LINKEDIN', 'BLUESKY', 'THREADS', 'MANUAL']);

export async function POST(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { name?: string; keywords?: string[] | string; excludedTerms?: string[] | string; platforms?: string[] };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const keywords = Array.isArray(body.keywords)
        ? body.keywords
        : String(body.keywords || '').split(',');
    const excludedTerms = Array.isArray(body.excludedTerms)
        ? body.excludedTerms
        : String(body.excludedTerms || '').split(',');
    const platforms = (body.platforms || [])
        .filter((platform) => PLATFORM_VALUES.has(platform)) as Platform[];

    try {
        const monitor = await createListeningMonitor(session.user.currentOrganizationId, {
            name: body.name || '',
            keywords,
            excludedTerms,
            platforms,
        });

        return NextResponse.json({ monitor }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create monitor' }, { status: 400 });
    }
}
