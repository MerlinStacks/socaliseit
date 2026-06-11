import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createCrawlerSource } from '@/lib/services/social-listening-crawler';

export async function POST(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { name?: string; url?: string; sourceType?: string; crawlDepth?: number };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (!body.url) {
        return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    try {
        const source = await createCrawlerSource(session.user.currentOrganizationId, {
            name: body.name || '',
            url: body.url,
            sourceType: body.sourceType || 'auto',
            crawlDepth: body.crawlDepth || 0,
        });

        return NextResponse.json({ source }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create source' }, { status: 400 });
    }
}
