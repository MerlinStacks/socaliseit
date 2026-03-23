/**
 * Shared Report API
 * GET /api/reports/share/[token]
 *
 * Public endpoint — no auth required. Validates share token and returns
 * cached report data for the live report viewer page.
 *
 * Why: Enables "live shareable link" delivery format for scheduled reports.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params;

        if (!token) {
            return NextResponse.json({ error: 'Token required' }, { status: 400 });
        }

        const report = await db.scheduledReport.findUnique({
            where: { shareToken: token },
            include: {
                organization: {
                    select: {
                        name: true,
                        logo: true,
                    },
                },
            },
        });

        if (!report) {
            return NextResponse.json({ error: 'Report not found' }, { status: 404 });
        }

        if (!report.isActive) {
            return NextResponse.json({ error: 'This report has been deactivated' }, { status: 403 });
        }

        // Check delivery format supports live link
        if (report.deliveryFormat !== 'link' && report.deliveryFormat !== 'both') {
            return NextResponse.json({ error: 'This report is not available as a live link' }, { status: 403 });
        }

        if (!report.lastReportData) {
            return NextResponse.json({
                error: 'Report data not yet available',
                message: 'This report has not been generated yet. Please check back later.',
            }, { status: 404 });
        }

        return NextResponse.json({
            data: {
                name: report.name,
                organization: report.organization,
                reportData: report.lastReportData,
                lastRunAt: report.lastRunAt,
                schedule: report.schedule,
            },
        });
    } catch (error) {
        logger.error({ error }, 'Shared report fetch failed');
        return NextResponse.json(
            { error: 'Failed to fetch report' },
            { status: 500 }
        );
    }
}
