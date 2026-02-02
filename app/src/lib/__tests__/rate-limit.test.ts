/**
 * Rate Limiter Unit Tests
 * Tests for sliding window rate limiting and utility functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    getClientIp,
    createRateLimitHeaders,
    DEFAULT_RATE_LIMIT,
    AUTH_RATE_LIMIT,
    EXPENSIVE_RATE_LIMIT,
    type RateLimitResult,
} from '../rate-limit';

describe('getClientIp', () => {
    it('should extract IP from X-Forwarded-For header', () => {
        const headers = new Headers({
            'x-forwarded-for': '192.168.1.1, 10.0.0.1, 172.16.0.1',
        });
        expect(getClientIp(headers)).toBe('192.168.1.1');
    });

    it('should extract IP from X-Real-IP header', () => {
        const headers = new Headers({
            'x-real-ip': '203.0.113.50',
        });
        expect(getClientIp(headers)).toBe('203.0.113.50');
    });

    it('should extract IP from CF-Connecting-IP header', () => {
        const headers = new Headers({
            'cf-connecting-ip': '198.51.100.100',
        });
        expect(getClientIp(headers)).toBe('198.51.100.100');
    });

    it('should prioritize X-Forwarded-For over other headers', () => {
        const headers = new Headers({
            'x-forwarded-for': '192.168.1.1',
            'x-real-ip': '192.168.2.2',
            'cf-connecting-ip': '192.168.3.3',
        });
        expect(getClientIp(headers)).toBe('192.168.1.1');
    });

    it('should prioritize X-Real-IP over CF-Connecting-IP', () => {
        const headers = new Headers({
            'x-real-ip': '192.168.2.2',
            'cf-connecting-ip': '192.168.3.3',
        });
        expect(getClientIp(headers)).toBe('192.168.2.2');
    });

    it('should return unknown when no IP headers present', () => {
        const headers = new Headers({});
        expect(getClientIp(headers)).toBe('unknown');
    });

    it('should trim whitespace from forwarded IP', () => {
        const headers = new Headers({
            'x-forwarded-for': '  192.168.1.1  , 10.0.0.1',
        });
        expect(getClientIp(headers)).toBe('192.168.1.1');
    });
});

describe('createRateLimitHeaders', () => {
    it('should create standard rate limit headers', () => {
        const result: RateLimitResult = {
            allowed: true,
            remaining: 95,
            resetAt: 1706745600,
            limit: 100,
        };

        const headers = createRateLimitHeaders(result);

        expect(headers['X-RateLimit-Limit']).toBe('100');
        expect(headers['X-RateLimit-Remaining']).toBe('95');
        expect(headers['X-RateLimit-Reset']).toBe('1706745600');
    });

    it('should handle zero remaining', () => {
        const result: RateLimitResult = {
            allowed: false,
            remaining: 0,
            resetAt: 1706745660,
            limit: 10,
        };

        const headers = createRateLimitHeaders(result);

        expect(headers['X-RateLimit-Remaining']).toBe('0');
    });
});

describe('Rate Limit Configurations', () => {
    it('should have sensible default rate limit', () => {
        expect(DEFAULT_RATE_LIMIT.max).toBe(100);
        expect(DEFAULT_RATE_LIMIT.windowSeconds).toBe(60);
        expect(DEFAULT_RATE_LIMIT.prefix).toBe('ratelimit');
    });

    it('should have stricter auth rate limit', () => {
        expect(AUTH_RATE_LIMIT.max).toBe(10);
        expect(AUTH_RATE_LIMIT.windowSeconds).toBe(60);
        expect(AUTH_RATE_LIMIT.prefix).toBe('ratelimit:auth');
    });

    it('should have strictest expensive operation limit', () => {
        expect(EXPENSIVE_RATE_LIMIT.max).toBe(5);
        expect(EXPENSIVE_RATE_LIMIT.windowSeconds).toBe(60);
        expect(EXPENSIVE_RATE_LIMIT.prefix).toBe('ratelimit:expensive');
    });

    it('should ensure auth limit is stricter than default', () => {
        expect(AUTH_RATE_LIMIT.max).toBeLessThan(DEFAULT_RATE_LIMIT.max);
    });

    it('should ensure expensive limit is stricter than auth', () => {
        expect(EXPENSIVE_RATE_LIMIT.max).toBeLessThan(AUTH_RATE_LIMIT.max);
    });
});
