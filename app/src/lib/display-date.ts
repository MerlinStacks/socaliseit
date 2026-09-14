import { format, formatDistanceToNow } from 'date-fns';

export const DATE_PLACEHOLDER = '—';

/** Validate display data before formatting; null must not become the Unix epoch. */
export function parseDisplayDate(value: unknown): Date | null {
    if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') return null;
    if (typeof value === 'string' && !value.trim()) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
}

/** Prefer the primary timestamp only when valid, then try the real fallback timestamp. */
export function resolveDisplayDate(value: unknown, fallback?: unknown): Date | null {
    return parseDisplayDate(value) ?? parseDisplayDate(fallback);
}

export function formatDisplayDate(value: unknown, pattern: string, fallback?: unknown): string {
    const date = resolveDisplayDate(value, fallback);
    return date ? format(date, pattern) : DATE_PLACEHOLDER;
}

export function formatDisplayDistance(value: unknown, fallback?: unknown): string {
    const date = resolveDisplayDate(value, fallback);
    return date ? formatDistanceToNow(date, { addSuffix: true }) : DATE_PLACEHOLDER;
}
