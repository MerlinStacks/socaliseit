/**
 * Publishing Queue slot math.
 *
 * Why this module is pure (no db, no queue): slot allocation is the one part of
 * the feature where correctness matters most and is hardest to eyeball — DST
 * gaps, day-of-week rollovers across timezones, and collision rules. Keeping it
 * free of I/O means every rule below is testable with plain Dates.
 *
 * Everything here is timezone-correct by construction: a slot is a *wall-clock*
 * time read in the queue's own timezone ("Mondays 09:00 Europe/Berlin"), so a
 * queue keeps its human rhythm across DST changes instead of sliding by an hour.
 */

import { getTimezoneOffset } from '@/lib/timezone-utils';
import type { QueueFillMode } from '@/generated/prisma/enums';

export const MINUTE_MS = 60_000;
/** Horizon to search for an open slot before giving up. */
export const DEFAULT_HORIZON_DAYS = 90;
/**
 * Why: two items must never publish at the same instant for one profile —
 * platforms reject or silently drop the second. 60s matches the smallest gap
 * users can reasonably configure ("slots 1 minute apart").
 */
export const MIN_SLOT_GAP_MS = MINUTE_MS;
/** Upper bound on how many already-scheduled items one NEXT may displace. */
export const MAX_DISPLACEMENTS = 200;

export interface SlotTemplate {
    id: string;
    /** 0 = Sunday … 6 = Saturday, read in the queue's timezone. */
    daysOfWeek: number[];
    /** Wall-clock "HH:mm" in the queue's timezone. */
    time: string;
    enabled?: boolean;
}

export interface Occurrence {
    slotId: string;
    at: Date;
}

/** A datetime already reserved in a queue. `ref` is the queue item id, so a
 *  displacement plan can be mapped back to the rows that must move.
 *
 *  `owned` distinguishes a slot held by this queue's own items from one held by
 *  something the queue does not manage - a post scheduled by hand on the same
 *  profile, for instance. Queueing may never move the latter. */
export interface TakenSlot {
    at: Date;
    ref: string;
    owned?: boolean;
}

export type AllocationFailure =
    | 'NO_SLOTS'      // Queue has no enabled slots
    | 'NO_CAPACITY'   // Every slot inside the horizon is filled
    | 'SHIFT_LIMIT';  // NEXT would displace more items than allowed

export type AllocationResult =
    | { ok: true; at: Date; slotId: string; displacements: Array<{ from: Date; to: Date; ref: string }> }
    | { ok: false; error: AllocationFailure };

// ============================================================================
// TIMEZONE HELPERS
// Why: Date's local accessors follow the *server's* zone, which silently breaks
// day-of-week matching when the queue's zone differs. All reads here go through
// Intl with an explicit timeZone. Offset math reuses the shared helper so there
// is one convention (positive = east), as enforced in timezone-utils.
// ============================================================================

const PARTS_FORMATTER = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timezone: string): Intl.DateTimeFormat {
    let formatter = PARTS_FORMATTER.get(timezone);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat('en-GB', {
            timeZone: timezone,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        });
        PARTS_FORMATTER.set(timezone, formatter);
    }
    return formatter;
}

export interface ZoneParts {
    year: number;
    month: number; // 1-12
    day: number;   // 1-31
    hour: number;  // 0-23
    minute: number;
    /** 0 = Sunday … 6 = Saturday */
    weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Calendar + clock components of an instant as seen in `timezone`. */
export function getZoneParts(instant: Date, timezone: string): ZoneParts {
    const parts = partsFormatter(timezone).formatToParts(instant);
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
    const weekdayName = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(instant);
    const weekday = WEEKDAY_INDEX[weekdayName] ?? instant.getUTCDay();
    return {
        year: Number(get('year')),
        month: Number(get('month')),
        day: Number(get('day')),
        hour: Number(get('hour')) % 24, // en-GB can return 24 for midnight
        minute: Number(get('minute')),
        weekday,
    };
}

/**
 * UTC instant for a wall-clock time in `timezone`.
 *
 * Two-pass: guess with the offset at the guess, then re-resolve at the corrected
 * instant so a DST change between the two guesses cannot leave an hour of drift.
 * Returns null for a wall clock that does not exist (spring-forward gap).
 */
export function zoneWallClockToUtc(
    year: number, month: number, day: number, hour: number, minute: number, timezone: string
): Date | null {
    const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
    let candidate = new Date(naive - getTimezoneOffset(new Date(naive), timezone) * MINUTE_MS);
    candidate = new Date(naive - getTimezoneOffset(candidate, timezone) * MINUTE_MS);

    const check = getZoneParts(candidate, timezone);
    if (check.year === year && check.month === month && check.day === day
        && check.hour === hour && check.minute === minute) {
        return candidate;
    }
    // Gap (or a sub-hour zone quirk): retry one hour later, the first valid
    // instant after the skipped clock. Beyond that, treat as unresolvable rather
    // than invent a time the user did not configure.
    const retry = new Date(candidate.getTime() + MINUTE_MS * 60);
    const retryParts = getZoneParts(retry, timezone);
    if (retryParts.year === year && retryParts.month === month && retryParts.day === day
        && retryParts.hour === hour && retryParts.minute === minute) {
        return retry;
    }
    return null;
}

/** Instant of the same wall-clock clock time on the following day in `timezone`. */
function addTzDay(instant: Date, timezone: string, days = 1): Date {
    const p = getZoneParts(instant, timezone);
    // Anchor at local noon before advancing so a DST day of 23/25 hours cannot
    // land us on the wrong calendar date.
    const anchor = zoneWallClockToUtc(p.year, p.month, p.day, 12, 0, timezone)
        ?? new Date(instant.getTime() + days * 24 * 60 * MINUTE_MS);
    const shifted = new Date(anchor.getTime() + days * 24 * 60 * MINUTE_MS);
    const sp = getZoneParts(shifted, timezone);
    return zoneWallClockToUtc(sp.year, sp.month, sp.day, 12, 0, timezone) ?? shifted;
}

// ============================================================================
// SLOT TEMPLATE VALIDATION
// ============================================================================

export const MAX_SLOTS_PER_QUEUE = 60;
export const MAX_LABELS_PER_ACCOUNT = 10; // Excluding the default queue.

export const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function isValidTime(value: string): boolean {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isValidDays(days: number[]): boolean {
    return Array.isArray(days) && days.length > 0
        && days.length <= 7 && days.every(d => Number.isInteger(d) && d >= 0 && d <= 6);
}

export function validateSlots(slots: Array<{ daysOfWeek: number[]; time: string }>): string | null {
    if (slots.length === 0) return 'A queue needs at least one time slot';
    if (slots.length > MAX_SLOTS_PER_QUEUE) return `A queue can have at most ${MAX_SLOTS_PER_QUEUE} time slots`;
    for (const slot of slots) {
        if (!isValidTime(slot.time)) return 'Slot times must be HH:mm (24-hour)';
        if (!isValidDays(slot.daysOfWeek)) return 'Each slot needs at least one day of the week (0 = Sunday)';
    }
    return null;
}

// ============================================================================
// OCCURRENCE GENERATION
// ============================================================================

/**
 * Every instant the template produces between `from` and `until`, ascending.
 *
 * Days are walked in the queue's timezone, so "Monday" means Monday for that
 * profile even when the server's zone disagrees. Duplicates (two template lines
 * resolving to the same instant) collapse, and unresolvable DST gaps are skipped.
 */
export function generateOccurrences(slots: SlotTemplate[], timezone: string, from: Date, until: Date): Occurrence[] {
    const enabled = slots.filter(slot => slot.enabled !== false && isValidTime(slot.time) && isValidDays(slot.daysOfWeek));
    if (enabled.length === 0 || until <= from) return [];

    const occurrences: Occurrence[] = [];
    const seen = new Set<number>();
    const startParts = getZoneParts(from, timezone);
    let dayProbe = zoneWallClockToUtc(startParts.year, startParts.month, startParts.day, 12, 0, timezone)
        ?? new Date(from.getTime());

    // Bounded by the horizon; +2 guards against a 25-hour DST day at the edge.
    const maxIterations = Math.ceil((until.getTime() - from.getTime()) / (24 * 60 * MINUTE_MS)) + 2;
    for (let i = 0; i < maxIterations; i++) {
        const parts = getZoneParts(dayProbe, timezone);
        for (const slot of enabled) {
            if (!slot.daysOfWeek.includes(parts.weekday)) continue;
            const [hour, minute] = slot.time.split(':').map(Number);
            const at = zoneWallClockToUtc(parts.year, parts.month, parts.day, hour, minute, timezone);
            if (!at || at < from || at > until || seen.has(at.getTime())) continue;
            seen.add(at.getTime());
            occurrences.push({ slotId: slot.id, at });
        }
        const next = addTzDay(dayProbe, timezone);
        if (next.getTime() <= dayProbe.getTime()) break;
        dayProbe = next;
    }

    return occurrences.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Whether two instants are too close to hold two posts for one profile. */
function conflicts(candidate: Date, taken: TakenSlot[], gapMs: number): boolean {
    return taken.some(t => Math.abs(t.at.getTime() - candidate.getTime()) < gapMs);
}

// ============================================================================
// ALLOCATION
// ============================================================================

export interface AllocateInput {
    slots: SlotTemplate[];
    timezone: string;
    mode: QueueFillMode;
    now: Date;
    taken: TakenSlot[];
    horizonDays?: number;
    gapMs?: number;
    /** Search window for the first pass; NEXT/LAST expand it once if starved. */
    until?: Date;
}

/**
 * Pick a datetime for one item.
 *
 * - AVAILABLE: first open occurrence at or after `now`. Earlier gaps are left
 *   alone, which keeps a stable rhythm when items are deleted.
 * - LAST: the first open occurrence after the most recently filled slot, so bulk
 *   drops append behind what is already queued.
 * - NEXT: the earliest occurrence the queue is allowed to use, pushing its own
 *   later items back one occurrence each so this one publishes first.
 *
 * Slots held by posts the queue does not own are never displaced; they are
 * treated as walls the allocator routes around.
 */
export function allocateSlot(input: AllocateInput): AllocationResult {
    const gapMs = input.gapMs ?? MIN_SLOT_GAP_MS;
    const horizonDays = input.horizonDays ?? DEFAULT_HORIZON_DAYS;
    const enabledSlots = input.slots.filter(slot => slot.enabled !== false);
    if (enabledSlots.length === 0) return { ok: false, error: 'NO_SLOTS' };

    const taken = [...input.taken]
        .filter(t => t.at >= input.now)
        .sort((a, b) => a.at.getTime() - b.at.getTime());
    const external = taken.filter(t => t.owned === false);

    const until = input.until ?? new Date(input.now.getTime() + horizonDays * 24 * 60 * MINUTE_MS);
    let occurrences = generateOccurrences(enabledSlots, input.timezone, input.now, until);
    let free = occurrences.filter(o => !conflicts(o.at, taken, gapMs));

    // Starved inside the default horizon: widen once before declaring NO_CAPACITY,
    // so a heavily-filled queue still finds room instead of failing.
    if (free.length === 0) {
        const extended = new Date(until.getTime() + horizonDays * 24 * 60 * MINUTE_MS);
        occurrences = generateOccurrences(enabledSlots, input.timezone, input.now, extended);
        free = occurrences.filter(o => !conflicts(o.at, taken, gapMs));
        if (free.length === 0) return { ok: false, error: 'NO_CAPACITY' };
    }

    const blocked = (at: Date) => conflicts(at, external, gapMs);

    if (input.mode === 'AVAILABLE') {
        const chosen = free[0];
        return { ok: true, at: chosen.at, slotId: chosen.slotId, displacements: [] };
    }

    if (input.mode === 'LAST') {
        const lastFilled = taken.length ? taken[taken.length - 1].at : null;
        const afterLast = lastFilled
            ? free.filter(o => o.at.getTime() >= lastFilled.getTime() + gapMs)
            : free;
        let chosen: Occurrence | undefined = afterLast[0];
        if (!chosen && lastFilled) {
            const extended = new Date(until.getTime() + horizonDays * 24 * 60 * MINUTE_MS);
            chosen = generateOccurrences(enabledSlots, input.timezone, input.now, extended)
                .find(o => o.at.getTime() >= lastFilled.getTime() + gapMs && !conflicts(o.at, taken, gapMs));
        }
        if (!chosen) return { ok: false, error: 'NO_CAPACITY' };
        return { ok: true, at: chosen.at, slotId: chosen.slotId, displacements: [] };
    }

    // NEXT: the earliest occurrence at or after `now` that no external post is
    // holding. If this queue's own items hold it, they cascade one occurrence
    // back so the post being queued now publishes first. An unoccupied earliest
    // slot inserts with no movement at all.
    const target = occurrences.find(o => !blocked(o.at));
    if (!target) return { ok: false, error: 'NO_CAPACITY' };
    const blocker = taken.find(t => Math.abs(t.at.getTime() - target.at.getTime()) < gapMs);
    if (!blocker) {
        return { ok: true, at: target.at, slotId: target.slotId, displacements: [] };
    }

    const displaced = taken.filter(t => t.at.getTime() >= target.at.getTime() - gapMs && t.owned !== false);
    if (displaced.length > MAX_DISPLACEMENTS) {
        return { ok: false, error: 'SHIFT_LIMIT' };
    }

    // Every displaced item's instant becomes available to the cascade — that is
    // what makes a chain shift work (x1 takes x2's slot, x2 moves on). Items
    // earlier than the target keep their times and still block collisions.
    const vacated = new Set(displaced.map(t => t.at.getTime()));
    const held: TakenSlot[] = taken.filter(t => !vacated.has(t.at.getTime()));
    const placements: Array<{ from: Date; to: Date; ref: string }> = [];
    let previousAt = target.at.getTime();

    for (const item of displaced) {
        const candidate = occurrences.find(o =>
            o.at.getTime() >= previousAt + gapMs
            && !blocked(o.at)
            && !held.some(h => Math.abs(h.at.getTime() - o.at.getTime()) < gapMs)
        );
        if (!candidate) return { ok: false, error: 'NO_CAPACITY' };
        placements.push({ from: item.at, to: candidate.at, ref: item.ref });
        held.push({ at: candidate.at, ref: item.ref });
        previousAt = candidate.at.getTime();
    }

    return { ok: true, at: target.at, slotId: target.slotId, displacements: placements };
}

/**
 * Next occurrences with their occupancy, for the settings preview.
 * Deliberately read-only and cheap: no allocation, just the template overlaid
 * with what is already reserved.
 */
export function previewOccurrences(options: {
    slots: SlotTemplate[];
    timezone: string;
    from: Date;
    until: Date;
    taken: TakenSlot[];
    limit?: number;
    gapMs?: number;
}): Array<Occurrence & { taken: boolean }> {
    const gapMs = options.gapMs ?? MIN_SLOT_GAP_MS;
    const occurrences = generateOccurrences(options.slots, options.timezone, options.from, options.until);
    const marked = occurrences.map(o => ({ ...o, taken: conflicts(o.at, options.taken, gapMs) }));
    return options.limit ? marked.slice(0, options.limit) : marked;
}
