/**
 * Utility for merging Tailwind classes with clsx
 * @see https://ui.shadcn.com/docs/installation/manual
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
}

/**
 * Safely parse a Request body as JSON.
 * Returns { ok: true, data: any } or { ok: false, error: string }.
 * Why: `data` is typed as `any` (same as `request.json()`) so call sites don't
 * need immediate casts. Migrate to Zod schemas for stricter typing over time.
 */
export async function safeParseJson(request: Request): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
    const body = await request.text();
    if (!body) {
        return { ok: false, error: 'Empty request body' };
    }
    try {
        const data = JSON.parse(body);
        return { ok: true, data };
    } catch {
        return { ok: false, error: 'Invalid JSON in request body' };
    }
}

export function safeJsonParse<T>(value: string, fallback: T): T {
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
