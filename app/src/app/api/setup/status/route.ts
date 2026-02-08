/**
 * Setup Status API (unauthenticated)
 * Returns whether this is a first-run installation (no users exist)
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
    try {
        const userCount = await db.user.count();
        return NextResponse.json({
            isFirstRun: userCount === 0,
        });
    } catch {
        // DB not ready — assume first run
        return NextResponse.json({ isFirstRun: true });
    }
}
