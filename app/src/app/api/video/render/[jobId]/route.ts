/**
 * Video Render Job Status API Route
 * Check progress and retrieve completed renders.
 */
import { NextRequest, NextResponse } from 'next/server';
import { renderJobs } from '../route';

interface RouteContext {
    params: Promise<{ jobId: string }>;
}

/**
 * GET /api/video/render/[jobId]
 * Get the status and progress of a render job
 */
export async function GET(
    request: NextRequest,
    context: RouteContext
) {
    const { jobId } = await context.params;
    const job = renderJobs.get(jobId);

    if (!job) {
        return NextResponse.json(
            { success: false, error: 'Job not found' },
            { status: 404 }
        );
    }

    return NextResponse.json({
        success: true,
        job: {
            id: job.id,
            status: job.status,
            progress: job.progress,
            outputUrl: job.outputUrl,
            error: job.error,
            createdAt: job.createdAt,
            completedAt: job.completedAt,
        },
    });
}

/**
 * DELETE /api/video/render/[jobId]
 * Cancel a queued or running render job
 */
export async function DELETE(
    request: NextRequest,
    context: RouteContext
) {
    const { jobId } = await context.params;
    const job = renderJobs.get(jobId);

    if (!job) {
        return NextResponse.json(
            { success: false, error: 'Job not found' },
            { status: 404 }
        );
    }

    if (job.status === 'complete') {
        return NextResponse.json(
            { success: false, error: 'Cannot cancel completed job' },
            { status: 400 }
        );
    }

    renderJobs.delete(jobId);

    return NextResponse.json({
        success: true,
        message: 'Job cancelled',
    });
}
