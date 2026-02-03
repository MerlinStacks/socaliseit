import { NextRequest, NextResponse } from 'next/server';

/**
 * Direct Messages API stub
 * Returns empty data for UI rendering - actual DM integration is a separate feature
 */

export async function GET(request: NextRequest) {
    // Return empty data structure for UI to render empty state
    return NextResponse.json({
        data: [],
        total: 0,
        page: 1,
        pageSize: 20
    });
}
