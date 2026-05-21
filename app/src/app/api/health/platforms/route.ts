/**
 * Platform Health API Endpoint
 *
 * Why: Exposes per-platform health scores for admin dashboards and
 * pre-publish warnings in the compose UI.
 */

import { NextResponse } from 'next/server';
import { getAllPlatformHealth, getHealthStatus } from '@/lib/resilience/platform-health';
import { getCircuitStatus } from '@/lib/resilience/circuit-breaker';
import { getDeadLetterCount } from '@/lib/resilience/dead-letter';
import { logger } from '@/lib/logger';
import { requireSuperAdmin } from '@/lib/admin/middleware';

/**
 * GET /api/health/platforms
 *
 * Returns health status for all platforms, circuit breaker states,
 * and the current dead-letter queue count.
 */
export async function GET() {
    const admin = await requireSuperAdmin();
    if (!admin.success) return admin.response;

    try {
        const [platforms, dlqCount] = await Promise.all([
            getAllPlatformHealth(),
            getDeadLetterCount(),
        ]);

        // Why: Fetch circuit breaker state per platform in parallel
        const circuitStates = await Promise.all(
            platforms.map(async (p) => {
                const circuit = await getCircuitStatus(p.platform);
                return {
                    platform: p.platform,
                    circuitState: circuit.state,
                    failureCount: circuit.failureCount,
                };
            }),
        );

        // Merge health + circuit data per platform
        const combined = platforms.map((health) => {
            const circuit = circuitStates.find((c) => c.platform === health.platform);
            return {
                ...health,
                circuitState: circuit?.circuitState ?? 'CLOSED',
                circuitFailures: circuit?.failureCount ?? 0,
            };
        });

        return NextResponse.json({
            platforms: combined,
            deadLetterCount: dlqCount,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch platform health');
        return NextResponse.json(
            { error: 'Failed to fetch platform health' },
            { status: 500 },
        );
    }
}
