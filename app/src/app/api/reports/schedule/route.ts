/**
 * Scheduled Reports CRUD API
 * GET    /api/reports/schedule — List scheduled reports for organization
 * POST   /api/reports/schedule — Create new scheduled report
 * PATCH  /api/reports/schedule — Update existing scheduled report
 * DELETE /api/reports/schedule — Delete a scheduled report
 *
 * Why: Manages the lifecycle of scheduled reports with flexible delivery
 * format options (PDF, live shareable link, or both).
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { randomUUID } from 'crypto';

// ============================================================================
// GET — List all scheduled reports for the org
// ============================================================================

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const reports = await db.scheduledReport.findMany({
            where: { organizationId: session.user.currentOrganizationId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                schedule: true,
                recipients: true,
                deliveryFormat: true,
                shareToken: true,
                isActive: true,
                lastRunAt: true,
                nextRunAt: true,
                createdAt: true,
            },
        });

        return NextResponse.json({ data: reports });
    } catch (error) {
        logger.error({ error }, 'Failed to list scheduled reports');
        return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
    }
}

// ============================================================================
// POST — Create a new scheduled report
// ============================================================================

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { name, schedule, recipients, config, deliveryFormat } = body;

        if (!name || !schedule || !recipients?.length) {
            return NextResponse.json(
                { error: 'name, schedule, and recipients are required' },
                { status: 400 }
            );
        }

        const validFormats = ['pdf', 'link', 'both'];
        const format = validFormats.includes(deliveryFormat) ? deliveryFormat : 'pdf';

        // Generate a share token if delivery includes a live link
        const needsShareToken = format === 'link' || format === 'both';
        const shareToken = needsShareToken ? randomUUID() : null;

        const nextRunAt = calculateNextRun(schedule);

        const report = await db.scheduledReport.create({
            data: {
                organizationId: session.user.currentOrganizationId,
                name,
                schedule,
                recipients,
                config: config || {},
                deliveryFormat: format,
                shareToken,
                nextRunAt,
                isActive: true,
            },
        });

        logger.info({ reportId: report.id }, 'Scheduled report created');

        return NextResponse.json({
            data: {
                id: report.id,
                shareToken: report.shareToken,
                shareUrl: report.shareToken
                    ? `${getBaseUrl()}/shared-report/${report.shareToken}`
                    : null,
            },
        }, { status: 201 });
    } catch (error) {
        logger.error({ error }, 'Failed to create scheduled report');
        return NextResponse.json({ error: 'Failed to create report' }, { status: 500 });
    }
}

// ============================================================================
// PATCH — Update a scheduled report
// ============================================================================

export async function PATCH(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { id, name, schedule, recipients, config, deliveryFormat, isActive } = body;

        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        // Verify ownership
        const existing = await db.scheduledReport.findFirst({
            where: { id, organizationId: session.user.currentOrganizationId },
        });

        if (!existing) {
            return NextResponse.json({ error: 'Report not found' }, { status: 404 });
        }

        // Build update data
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (schedule !== undefined) {
            updateData.schedule = schedule;
            updateData.nextRunAt = calculateNextRun(schedule);
        }
        if (recipients !== undefined) updateData.recipients = recipients;
        if (config !== undefined) updateData.config = config;
        if (isActive !== undefined) updateData.isActive = isActive;

        if (deliveryFormat !== undefined) {
            const validFormats = ['pdf', 'link', 'both'];
            if (validFormats.includes(deliveryFormat)) {
                updateData.deliveryFormat = deliveryFormat;

                // Generate share token if switching to link/both and none exists
                const needsShareToken = deliveryFormat === 'link' || deliveryFormat === 'both';
                if (needsShareToken && !existing.shareToken) {
                    updateData.shareToken = randomUUID();
                }
            }
        }

        const updated = await db.scheduledReport.update({
            where: { id },
            data: updateData,
        });

        return NextResponse.json({
            data: {
                id: updated.id,
                shareToken: updated.shareToken,
                shareUrl: updated.shareToken
                    ? `${getBaseUrl()}/shared-report/${updated.shareToken}`
                    : null,
            },
        });
    } catch (error) {
        logger.error({ error }, 'Failed to update scheduled report');
        return NextResponse.json({ error: 'Failed to update report' }, { status: 500 });
    }
}

// ============================================================================
// DELETE — Remove a scheduled report
// ============================================================================

export async function DELETE(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        // Verify ownership
        const existing = await db.scheduledReport.findFirst({
            where: { id, organizationId: session.user.currentOrganizationId },
        });

        if (!existing) {
            return NextResponse.json({ error: 'Report not found' }, { status: 404 });
        }

        await db.scheduledReport.delete({ where: { id } });

        return NextResponse.json({ data: { success: true } });
    } catch (error) {
        logger.error({ error }, 'Failed to delete scheduled report');
        return NextResponse.json({ error: 'Failed to delete report' }, { status: 500 });
    }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Calculate the next run time from a cron expression.
 * Simplified implementation — handles common patterns.
 */
function calculateNextRun(cronExpression: string): Date {
    const parts = cronExpression.split(' ');
    const hour = parseInt(parts[1]) || 9;
    const dayOfWeek = parseInt(parts[4]);

    const now = new Date();
    const next = new Date(now);

    if (!isNaN(dayOfWeek)) {
        // Weekly schedule — find next occurrence of dayOfWeek
        const daysUntil = (dayOfWeek - now.getDay() + 7) % 7 || 7;
        next.setDate(now.getDate() + daysUntil);
    } else {
        // Daily or monthly — next day
        next.setDate(now.getDate() + 1);
    }

    next.setHours(hour, 0, 0, 0);
    return next;
}

/**
 * Get base URL for generating shareable links.
 */
function getBaseUrl(): string {
    if (process.env.NEXT_PUBLIC_APP_URL) {
        return process.env.NEXT_PUBLIC_APP_URL;
    }
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
    }
    return 'http://localhost:3000';
}
