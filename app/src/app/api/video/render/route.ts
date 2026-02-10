/**
 * Video Render API Route
 * Handles video rendering requests and job management.
 * 
 * Why server-side: Video rendering is CPU-intensive and requires FFmpeg.
 * Jobs are queued and processed asynchronously.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { auth } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parse-json-body';
import { checkRateLimit, EXPENSIVE_RATE_LIMIT, createRateLimitHeaders } from '@/lib/rate-limit';

const renderRequestSchema = z.object({
    compositionId: z.enum(['SocialPost', 'VideoSlideshow']),
    inputProps: z.any(),
    format: z.enum(['mp4', 'webm', 'gif']).default('mp4'),
    quality: z.enum(['high', 'medium', 'low']).default('high'),
    aspectRatio: z.enum(['SQUARE', 'STORY', 'LANDSCAPE', 'PORTRAIT']).default('SQUARE'),
    durationInSeconds: z.number().positive(),
    fps: z.number().positive().default(30),
});

type RenderRequest = z.infer<typeof renderRequestSchema>;

// In-memory job store with cleanup (replace with Redis/DB in production)
const renderJobs = new Map<string, RenderJob>();
const MAX_RENDER_JOBS = 50;
const JOB_TTL_MS = 60 * 60 * 1000; // 1 hour

interface RenderJob {
    id: string;
    status: 'queued' | 'rendering' | 'complete' | 'failed';
    progress: number;
    request: RenderRequest;
    outputUrl?: string;
    error?: string;
    createdAt: Date;
    completedAt?: Date;
}

/**
 * Clean up old render jobs to prevent memory leaks.
 * Why: Without cleanup, renderJobs Map grows indefinitely.
 */
function cleanupRenderJobs(): void {
    const now = Date.now();
    for (const [key, job] of renderJobs.entries()) {
        const age = now - job.createdAt.getTime();
        // Remove completed/failed jobs older than TTL
        if ((job.status === 'complete' || job.status === 'failed') && age > JOB_TTL_MS) {
            renderJobs.delete(key);
        }
        // Remove stale queued jobs older than 2x TTL
        if (job.status === 'queued' && age > JOB_TTL_MS * 2) {
            renderJobs.delete(key);
        }
    }
}

// Run cleanup every 10 minutes
setInterval(cleanupRenderJobs, 10 * 60 * 1000);

/**
 * Generate a unique job ID
 */
function generateJobId(): string {
    return `render_${randomUUID()}`;
}

/**
 * POST /api/video/render
 * Queue a new video render job
 */
export async function POST(request: NextRequest) {
    try {
        // Auth check — this endpoint was previously unprotected
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Rate limit: 5 requests per minute for expensive render operations
        const rateLimitResult = await checkRateLimit(
            `${session.user.id}:render`, EXPENSIVE_RATE_LIMIT
        );
        if (!rateLimitResult.allowed) {
            return NextResponse.json(
                { success: false, error: 'Rate limit exceeded. Please try again later.' },
                { status: 429, headers: createRateLimitHeaders(rateLimitResult) }
            );
        }

        const { data: body, error } = await parseJsonBody(request);
        if (error) return error;
        const validated = renderRequestSchema.parse(body);

        const jobId = generateJobId();
        const job: RenderJob = {
            id: jobId,
            status: 'queued',
            progress: 0,
            request: validated,
            createdAt: new Date(),
        };

        renderJobs.set(jobId, job);

        // Start background rendering (in production, use a job queue like BullMQ)
        startRenderJob(jobId).catch((error) => {
            const failedJob = renderJobs.get(jobId);
            if (failedJob) {
                failedJob.status = 'failed';
                failedJob.error = error.message;
            }
        });

        return NextResponse.json({
            success: true,
            jobId,
            message: 'Render job queued successfully',
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: 'Invalid request', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { success: false, error: 'Failed to queue render job' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/video/render
 * List all render jobs (for debugging/admin)
 */
export async function GET() {
    // Auth check on GET too — lists render jobs
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    }

    const jobs = Array.from(renderJobs.values())
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 20);

    return NextResponse.json({ jobs });
}

/**
 * Background render job processor
 * In production, this would use @remotion/renderer with FFmpeg
 */
async function startRenderJob(jobId: string): Promise<void> {
    const job = renderJobs.get(jobId);
    if (!job) return;

    job.status = 'rendering';

    // Simulate rendering progress (replace with actual Remotion renderer)
    const totalSteps = 10;
    for (let i = 1; i <= totalSteps; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        job.progress = (i / totalSteps) * 100;
    }

    // In production, this would be the actual rendered video URL from MinIO/S3
    job.status = 'complete';
    job.progress = 100;
    job.outputUrl = `/api/video/render/${jobId}/download`;
    job.completedAt = new Date();
}

export { renderJobs };
