/**
 * Detailed Health Check API
 * Comprehensive system status for monitoring dashboard
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getRedisConnection } from '@/lib/bullmq/connection';
import { postPublishQueue } from '@/lib/bullmq/queues';
import { logger } from '@/lib/logger';
import type { Platform } from '@/generated/prisma/client';

interface ServiceStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    latency?: number;
    message?: string;
    details?: Record<string, unknown>;
}

interface QueueStats {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
}

interface PlatformCredentialStatus {
    platform: string;
    configured: boolean;
    hasAccounts: number;
}

interface DetailedHealthResponse {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    services: {
        database: ServiceStatus;
        redis: ServiceStatus;
        storage: ServiceStatus;
        environment: ServiceStatus;
    };
    queue: QueueStats | null;
    platforms: PlatformCredentialStatus[];
    worker: {
        active: boolean;
        lastJobTime?: string;
    };
    timestamp: string;
    version: string;
}

/**
 * GET /api/health/detailed
 * Returns comprehensive health status for all system components
 */
export async function GET() {
    const startTime = Date.now();
    const health: DetailedHealthResponse = {
        overall: 'healthy',
        services: {
            database: { status: 'unhealthy' },
            redis: { status: 'unhealthy' },
            storage: { status: 'healthy' }, // Default to healthy, check below
            environment: { status: 'healthy' },
        },
        queue: null,
        platforms: [],
        worker: { active: false },
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
    };

    // Check Database
    try {
        const dbStart = Date.now();
        await db.$queryRaw`SELECT 1`;
        health.services.database = {
            status: 'healthy',
            latency: Date.now() - dbStart,
            message: 'PostgreSQL connected',
        };
    } catch (error) {
        logger.error({ error }, 'Database health check failed');
        health.services.database = {
            status: 'unhealthy',
            message: error instanceof Error ? error.message : 'Database connection failed',
        };
        health.overall = 'unhealthy';
    }

    // Check Redis
    try {
        const redisStart = Date.now();
        const redis = getRedisConnection();
        await redis.ping();
        health.services.redis = {
            status: 'healthy',
            latency: Date.now() - redisStart,
            message: 'Redis connected',
        };
    } catch (error) {
        logger.error({ error }, 'Redis health check failed');
        health.services.redis = {
            status: 'unhealthy',
            message: error instanceof Error ? error.message : 'Redis connection failed',
        };
        health.overall = 'unhealthy';
    }

    // Check Storage (S3/MinIO)
    try {
        const s3Endpoint = process.env.S3_ENDPOINT;
        if (s3Endpoint) {
            const storageStart = Date.now();
            const response = await fetch(`${s3Endpoint}/minio/health/live`, {
                signal: AbortSignal.timeout(5000),
            }).catch(() => null);

            if (response?.ok) {
                health.services.storage = {
                    status: 'healthy',
                    latency: Date.now() - storageStart,
                    message: 'S3/MinIO accessible',
                };
            } else {
                health.services.storage = {
                    status: 'degraded',
                    message: 'S3/MinIO health check failed',
                };
                if (health.overall === 'healthy') health.overall = 'degraded';
            }
        } else {
            health.services.storage = {
                status: 'degraded',
                message: 'S3_ENDPOINT not configured',
            };
        }
    } catch (error) {
        health.services.storage = {
            status: 'degraded',
            message: 'Storage health check error',
        };
    }

    // Check Environment Variables
    const requiredEnvVars = [
        'DATABASE_URL',
        'REDIS_URL',
        'NEXTAUTH_SECRET',
        'ENCRYPTION_KEY',
    ];
    const missingVars = requiredEnvVars.filter((v) => !process.env[v]);
    if (missingVars.length > 0) {
        health.services.environment = {
            status: 'degraded',
            message: `Missing: ${missingVars.join(', ')}`,
            details: { missing: missingVars },
        };
        if (health.overall === 'healthy') health.overall = 'degraded';
    } else {
        health.services.environment = {
            status: 'healthy',
            message: 'All required environment variables present',
        };
    }

    // Check BullMQ Queue Stats
    try {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
            postPublishQueue.getWaitingCount(),
            postPublishQueue.getActiveCount(),
            postPublishQueue.getCompletedCount(),
            postPublishQueue.getFailedCount(),
            postPublishQueue.getDelayedCount(),
        ]);

        health.queue = { waiting, active, completed, failed, delayed };

        // Check for recent job activity to determine worker status
        const recentJobs = await postPublishQueue.getJobs(['completed', 'failed'], 0, 1);
        if (recentJobs.length > 0) {
            const lastJob = recentJobs[0];
            const finishedOn = lastJob.finishedOn;
            if (finishedOn) {
                health.worker.lastJobTime = new Date(finishedOn).toISOString();
                // If job completed in last 5 minutes, worker is likely active
                health.worker.active = Date.now() - finishedOn < 5 * 60 * 1000;
            }
        }

        // If there are active jobs, worker must be running
        if (active > 0) {
            health.worker.active = true;
        }
    } catch (error) {
        logger.error({ error }, 'Queue stats fetch failed');
    }

    // Check Global Platform Credentials
    try {
        const credentials = await db.globalPlatformCredential.findMany({
            select: {
                platform: true,
            },
        });

        const accounts = await db.socialAccount.groupBy({
            by: ['platform'],
            _count: true,
        });

        const accountsByPlatform = new Map(
            accounts.map((a) => [a.platform, a._count])
        );

        const platformList: Platform[] = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'YOUTUBE', 'PINTEREST', 'LINKEDIN'];
        health.platforms = platformList.map((platform) => ({
            platform,
            configured: credentials.some((c) => c.platform === platform || (platform === 'INSTAGRAM' && c.platform === 'META') || (platform === 'FACEBOOK' && c.platform === 'META')),
            hasAccounts: accountsByPlatform.get(platform) || 0,
        }));
    } catch (error) {
        logger.error({ error }, 'Platform credentials check failed');
    }

    // Determine overall health if any service is unhealthy
    if (
        health.services.database.status === 'unhealthy' ||
        health.services.redis.status === 'unhealthy'
    ) {
        health.overall = 'unhealthy';
    } else if (
        health.services.storage.status === 'degraded' ||
        health.services.environment.status === 'degraded'
    ) {
        health.overall = 'degraded';
    }

    const statusCode = health.overall === 'healthy' ? 200 : health.overall === 'degraded' ? 200 : 503;

    return NextResponse.json(health, { status: statusCode });
}
