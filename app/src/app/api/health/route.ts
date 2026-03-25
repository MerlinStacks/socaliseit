import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getRedisConnection } from '@/lib/bullmq/connection';

/**
 * Health check endpoint for Docker/Kubernetes probes.
 * Verifies DB and Redis connectivity so Docker only marks the container
 * healthy when it can actually serve requests. This is important because
 * the worker depends_on webapp: service_healthy before starting.
 */
export async function GET() {
    const checks: Record<string, string> = {};

    // Database check
    try {
        await db.$queryRaw`SELECT 1`;
        checks.database = 'ok';
    } catch {
        checks.database = 'error';
    }

    // Redis check
    try {
        const redis = getRedisConnection();
        await redis.ping();
        checks.redis = 'ok';
    } catch {
        checks.redis = 'error';
    }

    const healthy = Object.values(checks).every((v) => v === 'ok');

    return NextResponse.json(
        {
            status: healthy ? 'healthy' : 'degraded',
            checks,
            timestamp: new Date().toISOString(),
        },
        { status: healthy ? 200 : 503 },
    );
}
