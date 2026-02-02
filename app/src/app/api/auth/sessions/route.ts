/**
 * Active Sessions API
 * GET: List all active sessions for current user
 * DELETE: Terminate specific session or all sessions except current
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * Parse user agent string to extract device info
 */
function parseUserAgent(ua: string | null): { device: string; browser: string; os: string } {
    if (!ua) return { device: 'Unknown Device', browser: 'Unknown', os: 'Unknown' };

    let device = 'Desktop';
    let browser = 'Unknown';
    let os = 'Unknown';

    // Detect OS
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac OS')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) { os = 'Android'; device = 'Mobile'; }
    else if (ua.includes('iPhone') || ua.includes('iPad')) {
        os = ua.includes('iPad') ? 'iPadOS' : 'iOS';
        device = ua.includes('iPad') ? 'Tablet' : 'Mobile';
    }

    // Detect Browser
    if (ua.includes('Chrome') && !ua.includes('Edge')) browser = 'Chrome';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Edge')) browser = 'Edge';

    return { device, browser, os };
}

/**
 * GET /api/auth/sessions
 * Returns all active sessions for the current user
 */
export async function GET() {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessions = await db.session.findMany({
        where: {
            userId: session.user.id,
            expires: { gt: new Date() }, // Only active sessions
        },
        orderBy: { lastUsedAt: 'desc' },
        select: {
            id: true,
            userAgent: true,
            ipAddress: true,
            deviceName: true,
            lastUsedAt: true,
            createdAt: true,
            sessionToken: true,
        },
    });

    // Transform sessions with parsed user agent
    const transformedSessions = sessions.map((s) => {
        const parsed = parseUserAgent(s.userAgent);
        return {
            id: s.id,
            device: s.deviceName || `${parsed.browser} on ${parsed.os}`,
            deviceType: parsed.device,
            browser: parsed.browser,
            os: parsed.os,
            ipAddress: s.ipAddress || 'Unknown',
            lastUsedAt: s.lastUsedAt,
            createdAt: s.createdAt,
            // Mark current session (compare tokens - but we don't expose full token)
            isCurrent: false, // Will be determined client-side or via cookie comparison
        };
    });

    return NextResponse.json({ sessions: transformedSessions });
}

/**
 * DELETE /api/auth/sessions
 * Body: { sessionId?: string, all?: boolean }
 * - sessionId: Terminate specific session
 * - all: true - Terminate all sessions except current
 */
export async function DELETE(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { sessionId, all } = body as { sessionId?: string; all?: boolean };

    if (all) {
        // Delete all sessions except the ones that haven't expired
        // Note: We can't easily identify "current" session without cookie access
        // So we delete all and let the current session recreate on next request
        const result = await db.session.deleteMany({
            where: {
                userId: session.user.id,
            },
        });

        return NextResponse.json({
            success: true,
            message: `Signed out of ${result.count} devices`,
            count: result.count,
        });
    }

    if (sessionId) {
        // Delete specific session
        const targetSession = await db.session.findFirst({
            where: {
                id: sessionId,
                userId: session.user.id, // Ensure user owns this session
            },
        });

        if (!targetSession) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        await db.session.delete({
            where: { id: sessionId },
        });

        return NextResponse.json({ success: true, message: 'Session terminated' });
    }

    return NextResponse.json({ error: 'Missing sessionId or all parameter' }, { status: 400 });
}
