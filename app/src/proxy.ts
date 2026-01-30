/**
 * Next.js Proxy (formerly Middleware)
 * Handles rate limiting and security headers for API routes
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * In-memory rate limiting for Edge runtime.
 * For production, this is supplemented by Redis-based limiting in API routes.
 * This provides a first line of defense at the edge.
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT = {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // requests per window
};

function getRateLimitInfo(ip: string): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const record = rateLimitMap.get(ip);

    if (!record || record.resetAt < now) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
        return { allowed: true, remaining: RATE_LIMIT.max - 1 };
    }

    if (record.count >= RATE_LIMIT.max) {
        return { allowed: false, remaining: 0 };
    }

    record.count++;
    return { allowed: true, remaining: RATE_LIMIT.max - record.count };
}

function getClientIp(request: NextRequest): string {
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
    }
    return request.headers.get('x-real-ip') ||
        request.headers.get('cf-connecting-ip') ||
        'unknown';
}

// Cleanup old entries periodically (in-memory only)
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitMap.entries()) {
        if (value.resetAt < now) {
            rateLimitMap.delete(key);
        }
    }
}, 60 * 1000); // Every minute

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Only apply rate limiting to API routes
    if (pathname.startsWith('/api')) {
        const ip = getClientIp(request);
        const { allowed, remaining } = getRateLimitInfo(ip);

        if (!allowed) {
            return new NextResponse(
                JSON.stringify({
                    error: 'Too Many Requests',
                    message: 'Rate limit exceeded. Please try again later.',
                }),
                {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json',
                        'Retry-After': '60',
                        'X-RateLimit-Limit': String(RATE_LIMIT.max),
                        'X-RateLimit-Remaining': '0',
                    },
                }
            );
        }

        // Continue with rate limit headers
        const response = NextResponse.next();
        response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT.max));
        response.headers.set('X-RateLimit-Remaining', String(remaining));
        return response;
    }

    // Add security headers to all responses
    const response = NextResponse.next();

    // Security headers
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return response;
}

export const config = {
    matcher: [
        // Apply to all routes except static files and Next.js internals
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
