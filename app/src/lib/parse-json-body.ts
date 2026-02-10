/**
 * Safe JSON Body Parser
 * Wraps request.json() with error handling to return 400 on malformed JSON
 * instead of letting it throw and produce a bare 500.
 *
 * Why: Next.js App Router's request.json() throws on invalid JSON.
 * Without a try/catch, this surfaces as a 500 with no indication that
 * the client sent bad data. This helper standardizes the pattern.
 *
 * Usage:
 *   const { data, error } = await parseJsonBody<MyType>(request);
 *   if (error) return error; // Already a NextResponse with status 400
 */

import { NextResponse } from 'next/server';

type ParseResult<T> =
    | { data: T; error: null }
    | { data: null; error: NextResponse };

export async function parseJsonBody<T = Record<string, unknown>>(
    request: Request
): Promise<ParseResult<T>> {
    try {
        const data = await request.json() as T;
        return { data, error: null };
    } catch {
        return {
            data: null,
            error: NextResponse.json(
                { error: 'Invalid JSON body' },
                { status: 400 }
            ),
        };
    }
}
