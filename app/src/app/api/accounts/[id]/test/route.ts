/**
 * Account Test Connection API
 * Validates that a specific account's token is still working by making a lightweight API call.
 *
 * Why: Allows users to manually verify connection before attempting to publish.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

interface TestResult {
    success: boolean;
    platform: string;
    accountName: string;
    message: string;
    responseTime?: number;
}

/**
 * Platform-specific test endpoints.
 * Each makes a lightweight authenticated call to verify the token works.
 */
async function testPlatformConnection(
    platform: string,
    accessToken: string
): Promise<{ success: boolean; message: string; responseTime: number }> {
    const startTime = Date.now();

    try {
        let testUrl: string;
        let headers: HeadersInit = { Authorization: `Bearer ${accessToken}` };

        switch (platform.toUpperCase()) {
            case 'INSTAGRAM':
            case 'FACEBOOK':
            case 'META':
                testUrl = `https://graph.facebook.com/v21.0/me?access_token=${accessToken}`;
                headers = {}; // Token in URL for Meta
                break;

            case 'TIKTOK':
                testUrl = 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name';
                break;

            case 'YOUTUBE':
            case 'GOOGLE_BUSINESS':
                testUrl = 'https://www.googleapis.com/oauth2/v3/tokeninfo';
                headers = {}; // Different auth pattern
                testUrl += `?access_token=${accessToken}`;
                break;

            case 'PINTEREST':
                testUrl = 'https://api.pinterest.com/v5/user_account';
                break;

            case 'LINKEDIN':
                testUrl = 'https://api.linkedin.com/v2/userinfo';
                break;

            case 'BLUESKY':
                // Bluesky uses session-based auth, skip API test
                return {
                    success: true,
                    message: 'Bluesky connection assumed valid',
                    responseTime: Date.now() - startTime,
                };

            default:
                return {
                    success: false,
                    message: `Unknown platform: ${platform}`,
                    responseTime: Date.now() - startTime,
                };
        }

        const response = await fetch(testUrl, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(10000), // 10 second timeout
        });

        const responseTime = Date.now() - startTime;

        if (response.ok) {
            return {
                success: true,
                message: 'Connection verified successfully',
                responseTime,
            };
        }

        // Parse error response
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
            errorData.error?.message || errorData.message || `HTTP ${response.status}`;

        return {
            success: false,
            message: `API error: ${errorMessage}`,
            responseTime,
        };
    } catch (error) {
        const responseTime = Date.now() - startTime;
        const message = error instanceof Error ? error.message : 'Connection test failed';

        return {
            success: false,
            message,
            responseTime,
        };
    }
}

/**
 * POST /api/accounts/[id]/test
 * Test connection for a specific account.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        // Fetch account with workspace isolation
        const account = await db.socialAccount.findFirst({
            where: {
                id,
                workspaceId: session.user.currentWorkspaceId,
            },
            select: {
                id: true,
                platform: true,
                name: true,
                accessToken: true,
            },
        });

        if (!account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }

        // Test the connection
        const testResult = await testPlatformConnection(account.platform, account.accessToken);

        const result: TestResult = {
            success: testResult.success,
            platform: account.platform.toLowerCase(),
            accountName: account.name,
            message: testResult.message,
            responseTime: testResult.responseTime,
        };

        logger.info(
            { accountId: id, platform: account.platform, success: testResult.success },
            'Account connection test'
        );

        return NextResponse.json(result);
    } catch (error) {
        logger.error({ error }, 'Failed to test account connection');
        return NextResponse.json({ error: 'Failed to test connection' }, { status: 500 });
    }
}
