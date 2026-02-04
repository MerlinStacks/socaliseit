/**
 * Test Late.dev API Connection
 *
 * Why: Validates that the user's Late API key is working before saving.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';

const LATE_API_BASE = 'https://getlate.dev/api/v1';

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { apiKey } = body;

        if (!apiKey) {
            return NextResponse.json({ error: 'API key is required' }, { status: 400 });
        }

        // Test the API key by listing accounts
        const response = await fetch(`${LATE_API_BASE}/accounts`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            logger.warn({ status: response.status, error: errorData }, 'Late API key validation failed');
            return NextResponse.json({
                success: false,
                error: errorData.error || 'Invalid API key',
            }, { status: 400 });
        }

        const data = await response.json();

        logger.info('Late API key validated successfully');

        return NextResponse.json({
            success: true,
            accountCount: data.accounts?.length || 0,
            message: `Connected! Found ${data.accounts?.length || 0} connected account(s).`,
        });
    } catch (error) {
        logger.error({ error }, 'Failed to test Late API key');
        return NextResponse.json(
            { success: false, error: 'Failed to connect to Late.dev' },
            { status: 500 }
        );
    }
}
