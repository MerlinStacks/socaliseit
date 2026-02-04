/**
 * AI Draft Generation API
 * 
 * POST /api/ai/scheduling/generate-drafts
 * Triggers AI draft generation for the current organization.
 * Called on calendar load or manually by user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { generateAiDrafts } from '@/lib/ai/draft-generator';

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const result = await generateAiDrafts(session.user.currentOrganizationId);

        return NextResponse.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('Error generating AI drafts:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to generate AI drafts' },
            { status: 500 }
        );
    }
}
