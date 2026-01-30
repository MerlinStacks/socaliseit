/**
 * User Sessions API
 * Manages active sessions for the current user
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { cookies } from 'next/headers';

/**
 * Parses user agent to extract device name
 */
function parseDeviceName(userAgent: string | null): string {
    if (!userAgent) return 'Unknown Device';

    // Simple heuristics for common browsers/devices
    const ua = userAgent.toLowerCase();

    let browser = 'Browser';
    if (ua.includes('chrome') && !ua.includes('edg')) browser = 'Chrome';
    else if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
    else if (ua.includes('edg')) browser = 'Edge';
    else if (ua.includes('opera') || ua.includes('opr')) browser = 'Opera';

    let os = '';
    if (ua.includes('windows')) os = 'Windows';
    else if (ua.includes('mac')) os = 'macOS';
    else if (ua.includes('linux')) os = 'Linux';
    else if (ua.includes('android')) os = 'Android';
    else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';

    return os ? `${browser} on ${os}` : browser;
}

/**
 * GET /api/user/sessions
 * Returns all active sessions for current user
 */
export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get current session token from cookies to identify current session
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('authjs.session-token')?.value
        || cookieStore.get('__Secure-authjs.session-token')?.value;

    const sessions = await db.session.findMany({
        where: {
            userId: session.user.id,
            expires: { gt: new Date() }, // Only non-expired sessions
        },
        orderBy: { lastUsedAt: 'desc' },
    });

    const formattedSessions = sessions.map((s) => ({
        id: s.id,
        deviceName: s.deviceName || parseDeviceName(s.userAgent),
        ipAddress: s.ipAddress || 'Unknown',
        lastUsedAt: s.lastUsedAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
        isCurrent: s.sessionToken === sessionToken,
    }));

    return NextResponse.json({ sessions: formattedSessions });
}

/**
 * DELETE /api/user/sessions
 * Revokes one or all other sessions
 */
export async function DELETE(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { sessionId, revokeAll } = body;

    // Get current session token to exclude it
    const cookieStore = await cookies();
    const currentSessionToken = cookieStore.get('authjs.session-token')?.value
        || cookieStore.get('__Secure-authjs.session-token')?.value;

    if (revokeAll) {
        // Revoke all sessions except current
        await db.session.deleteMany({
            where: {
                userId: session.user.id,
                NOT: { sessionToken: currentSessionToken },
            },
        });

        return NextResponse.json({
            success: true,
            message: 'All other sessions revoked',
        });
    }

    if (!sessionId) {
        return NextResponse.json(
            { error: 'Session ID is required' },
            { status: 400 }
        );
    }

    // Find the session to revoke
    const targetSession = await db.session.findUnique({
        where: { id: sessionId },
    });

    if (!targetSession) {
        return NextResponse.json(
            { error: 'Session not found' },
            { status: 404 }
        );
    }

    // Verify ownership
    if (targetSession.userId !== session.user.id) {
        return NextResponse.json(
            { error: 'Not authorized to revoke this session' },
            { status: 403 }
        );
    }

    // Prevent revoking current session
    if (targetSession.sessionToken === currentSessionToken) {
        return NextResponse.json(
            { error: 'Cannot revoke current session. Use logout instead.' },
            { status: 400 }
        );
    }

    await db.session.delete({
        where: { id: sessionId },
    });

    return NextResponse.json({
        success: true,
        message: 'Session revoked',
    });
}
