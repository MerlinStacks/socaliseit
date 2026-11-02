/**
 * Shared session + permission gate for the publishing-queue routes.
 *
 * Why a local helper: these routes all need the same two facts (which workspace,
 * may this user act on it), and the queue feature spans two permission families -
 * editing templates is a settings action, placing content is a scheduling one.
 * Keeping the mapping in one place stops the two halves drifting apart.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission, PERMISSIONS, type PermissionCode } from '@/lib/auth/with-permission';

export const QUEUE_READ = PERMISSIONS.SETTINGS_VIEW;
export const QUEUE_MANAGE = PERMISSIONS.SETTINGS_EDIT;
export const QUEUE_SCHEDULE = PERMISSIONS.POSTS_SCHEDULE;
export const QUEUE_CREATE = PERMISSIONS.POSTS_CREATE;

export type AuthContext = { userId: string; organizationId: string };

export async function requireQueueAccess(
    permission: PermissionCode,
): Promise<{ context: AuthContext } | { response: NextResponse }> {
    const session = await auth();
    const userId = session?.user?.id;
    const organizationId = session?.user?.currentOrganizationId;
    if (!userId || !organizationId) {
        return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }
    if (!await hasPermission(organizationId, userId, permission)) {
        return { response: NextResponse.json({ error: 'You do not have permission to manage publishing queues' }, { status: 403 }) };
    }
    return { context: { userId, organizationId } };
}

/** Why: bodies are JSON here, and an array-shaped body must not reach Prisma. */
export function readJsonBody(input: unknown): Record<string, unknown> | null {
    return typeof input === 'object' && input !== null && !Array.isArray(input)
        ? input as Record<string, unknown> : null;
}

export function stringList(value: unknown, field: string, max: number): string[] {
    if (!Array.isArray(value) || value.length === 0) throw new TypeError(`${field} must be a non-empty list`);
    if (value.length > max) throw new TypeError(`${field} accepts at most ${max} entries`);
    if (!value.every(entry => typeof entry === 'string' && entry.trim())) throw new TypeError(`${field} must contain ids`);
    return [...new Set(value as string[])];
}

export function optionalString(value: unknown, field: string, maxLength: number): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') throw new TypeError(`${field} must be a string`);
    const trimmed = value.trim();
    if (trimmed.length > maxLength) throw new TypeError(`${field} is too long`);
    return trimmed || undefined;
}

export const FILL_MODES = ['NEXT', 'LAST', 'AVAILABLE'] as const;

const DAY_SET = new Set([0, 1, 2, 3, 4, 5, 6]);

/** Validates the slot list shape before it reaches the service's own checks. */
export function readSlots(value: unknown): Array<{ id?: string; daysOfWeek: number[]; time: string; enabled?: boolean }> {
    if (!Array.isArray(value) || value.length === 0) throw new TypeError('slots must be a non-empty list');
    if (value.length > 60) throw new TypeError('slots accepts at most 60 entries');
    return value.map(entry => {
        if (typeof entry !== 'object' || entry === null) throw new TypeError('Each slot must be an object');
        const candidate = entry as Record<string, unknown>;
        const time = typeof candidate.time === 'string' ? candidate.time.trim() : '';
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new TypeError('Slot times must be HH:mm (24-hour)');
        const days = Array.isArray(candidate.daysOfWeek) ? candidate.daysOfWeek : [];
        if (days.length === 0 || !days.every(day => typeof day === 'number' && DAY_SET.has(day))) {
            throw new TypeError('Each slot needs days of the week as numbers 0-6');
        }
        return {
            id: typeof candidate.id === 'string' ? candidate.id : undefined,
            daysOfWeek: [...new Set(days as number[])].sort((a, b) => a - b),
            time,
            enabled: candidate.enabled === undefined ? true : candidate.enabled === true,
        };
    });
}

export function readMode(value: unknown): 'NEXT' | 'LAST' | 'AVAILABLE' {
    if (value === undefined || value === null) return 'AVAILABLE';
    if (typeof value !== 'string' || !FILL_MODES.includes(value.toUpperCase() as typeof FILL_MODES[number])) {
        throw new TypeError('mode must be NEXT, LAST, or AVAILABLE');
    }
    return value.toUpperCase() as 'NEXT' | 'LAST' | 'AVAILABLE';
}

/** Maps a thrown error onto an HTTP response, keeping QueueError statuses. */
export function queueErrorResponse(error: unknown, fallback = 'Could not update publishing queues'): NextResponse {
    if (error instanceof TypeError) return NextResponse.json({ error: error.message }, { status: 400 });
    const status = typeof error === 'object' && error !== null && 'status' in error
        ? (error as { status: number }).status : 500;
    if (status >= 400 && status < 600) {
        return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status });
    }
    return NextResponse.json({ error: fallback }, { status: 500 });
}
