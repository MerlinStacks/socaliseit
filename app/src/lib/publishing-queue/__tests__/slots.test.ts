// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
    allocateSlot,
    generateOccurrences,
    getZoneParts,
    previewOccurrences,
    validateSlots,
    zoneWallClockToUtc,
} from '../slots';

const slot = (id: string, daysOfWeek: number[], time: string, enabled = true) => ({ id, daysOfWeek, time, enabled });

describe('zoneWallClockToUtc', () => {
    it('resolves a standard-time wall clock', () => {
        // 09:00 in Berlin in January is CET (UTC+1) → 08:00Z
        expect(zoneWallClockToUtc(2026, 1, 15, 9, 0, 'Europe/Berlin')?.toISOString())
            .toBe('2026-01-15T08:00:00.000Z');
    });

    it('resolves the same wall clock after the DST change', () => {
        // Berlin is CEST (UTC+2) from late March, so 09:00 is 07:00Z
        expect(zoneWallClockToUtc(2026, 4, 15, 9, 0, 'Europe/Berlin')?.toISOString())
            .toBe('2026-04-15T07:00:00.000Z');
    });

    it('returns null for a wall clock inside the spring-forward gap', () => {
        // 02:30 does not exist on the last Sunday of March in Berlin
        expect(zoneWallClockToUtc(2026, 3, 29, 2, 30, 'Europe/Berlin')).toBeNull();
    });

    it('handles a zone west of UTC', () => {
        // 09:00 in New York in January is EST (UTC-5)
        expect(zoneWallClockToUtc(2026, 1, 15, 9, 0, 'America/New_York')?.toISOString())
            .toBe('2026-01-15T14:00:00.000Z');
    });

    it('round-trips back to the same wall clock', () => {
        const at = zoneWallClockToUtc(2026, 7, 4, 17, 30, 'Asia/Tokyo')!;
        const parts = getZoneParts(at, 'Asia/Tokyo');
        expect([parts.year, parts.month, parts.day, parts.hour, parts.minute])
            .toEqual([2026, 7, 4, 17, 30]);
    });
});

describe('getZoneParts', () => {
    it('reports the weekday in the target zone, not the server zone', () => {
        // 2026-01-05 is a Monday. 23:00Z Monday is already Tuesday 08:00 in Tokyo.
        const mondayUtc = new Date('2026-01-05T23:00:00Z');
        expect(getZoneParts(mondayUtc, 'UTC').weekday).toBe(1);
        expect(getZoneParts(mondayUtc, 'Asia/Tokyo').weekday).toBe(2);
    });
});

describe('generateOccurrences', () => {
    const from = new Date('2026-03-01T00:00:00Z');

    it('produces one occurrence per matching day', () => {
        const result = generateOccurrences([slot('a', [1, 3], '09:00', true)], 'UTC', from, new Date(from.getTime() + 14 * 864e5));
        expect(result).toHaveLength(4); // Mon 2, Wed 4, Mon 9, Wed 11 (Mar 2026 starts on a Sunday)
        expect(result[0].at.toISOString()).toBe('2026-03-02T09:00:00.000Z');
    });

    it('drops disabled slots', () => {
        const result = generateOccurrences([slot('a', [1], '09:00', false)], 'UTC', from, new Date(from.getTime() + 14 * 864e5));
        expect(result).toHaveLength(0);
    });

    it('keeps the wall-clock time across a DST transition', () => {
        const berlin = [slot('a', [1], '09:00', true)];
        // Spring forward is Sunday 2026-03-29 in Berlin: 09:00 is 08:00Z before,
        // 07:00Z after — the local time the user configured never moves.
        const before = generateOccurrences(berlin, 'Europe/Berlin', new Date('2026-03-16T00:00:00Z'), new Date('2026-03-23T00:00:00Z'));
        const after = generateOccurrences(berlin, 'Europe/Berlin', new Date('2026-03-30T00:00:00Z'), new Date('2026-04-06T00:00:00Z'));
        expect(before[0].at.toISOString()).toBe('2026-03-16T08:00:00.000Z');
        expect(after[0].at.toISOString()).toBe('2026-03-30T07:00:00.000Z');
    });

    it('never emits the same instant twice for overlapping templates', () => {
        const result = generateOccurrences(
            [slot('a', [1], '09:00', true), slot('b', [1], '09:00', true)],
            'UTC', from, new Date(from.getTime() + 7 * 864e5),
        );
        expect(result.map(o => o.at.toISOString())).toEqual(['2026-03-02T09:00:00.000Z']);
    });

    it('excludes occurrences before the window opens', () => {
        const result = generateOccurrences([slot('a', [0, 1, 2, 3, 4, 5, 6], '06:00', true)], 'UTC',
            new Date('2026-03-04T07:00:00Z'), new Date('2026-03-06T00:00:00Z'));
        expect(result.map(o => o.at.toISOString()))
            .toEqual(['2026-03-05T06:00:00.000Z']);
    });
});

describe('allocateSlot', () => {
    const now = new Date('2026-03-02T00:00:00Z');
    const slots = [slot('a', [0, 1, 2, 3, 4, 5, 6], '09:00', true), slot('b', [0, 1, 2, 3, 4, 5, 6], '18:00', true)];
    const takenAt = (iso: string, ref: string) => ({ at: new Date(iso), ref });

    it('fills the first open occurrence in AVAILABLE mode', () => {
        const result = allocateSlot({ slots, timezone: 'UTC', mode: 'AVAILABLE', now, taken: [] });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.at.toISOString()).toBe('2026-03-02T09:00:00.000Z');
    });

    it('skips a filled slot in AVAILABLE mode and leaves earlier gaps alone', () => {
        // Day 1 morning is in the past; day 1 morning free but day 1 evening taken
        const taken = [takenAt('2026-03-02T18:00:00Z', 'x1')];
        const result = allocateSlot({ slots, timezone: 'UTC', mode: 'AVAILABLE', now, taken });
        if (!result.ok) throw new Error('expected allocation');
        expect(result.at.toISOString()).toBe('2026-03-02T09:00:00.000Z');
    });

    it('places LAST after the most recently filled slot', () => {
        const taken = [takenAt('2026-03-02T09:00:00Z', 'x1'), takenAt('2026-03-03T09:00:00Z', 'x2')];
        const result = allocateSlot({ slots, timezone: 'UTC', mode: 'LAST', now, taken });
        if (!result.ok) throw new Error('expected allocation');
        expect(result.at.toISOString()).toBe('2026-03-03T18:00:00.000Z');
    });

    it('never fills an earlier gap when LAST has no capacity after its tail', () => {
        const result = allocateSlot({ slots, timezone: 'UTC', mode: 'LAST', now, horizonDays: 1, taken: [takenAt('2026-03-10T09:00:00Z', 'tail')] });
        expect(result).toEqual({ ok: false, error: 'NO_CAPACITY' });
    });

    it('accepts exactly one minute between adjacent slots', () => {
        const adjacent = [slot('a', [1], '09:00'), slot('b', [1], '09:01')];
        const result = allocateSlot({ slots: adjacent, timezone: 'UTC', mode: 'LAST', now, taken: [takenAt('2026-03-02T09:00:00Z', 'tail')] });
        expect(result.ok && result.at.toISOString()).toBe('2026-03-02T09:01:00.000Z');
    });

    it('pushes existing items back one slot in NEXT mode', () => {
        const taken = [takenAt('2026-03-02T09:00:00Z', 'x1'), takenAt('2026-03-02T18:00:00Z', 'x2')];
        const result = allocateSlot({ slots, timezone: 'UTC', mode: 'NEXT', now, taken });
        if (!result.ok) throw new Error('expected allocation');
        expect(result.at.toISOString()).toBe('2026-03-02T09:00:00.000Z');
        expect(result.displacements).toEqual([
            { from: new Date('2026-03-02T09:00:00Z'), to: new Date('2026-03-02T18:00:00Z'), ref: 'x1' },
            { from: new Date('2026-03-02T18:00:00Z'), to: new Date('2026-03-03T09:00:00Z'), ref: 'x2' },
        ]);
    });

    it('leaves earlier items untouched when NEXT inserts into a free slot', () => {
        // 09:00 today is open, so nothing needs to move.
        const taken = [takenAt('2026-03-02T18:00:00Z', 'later')];
        const result = allocateSlot({ slots, timezone: 'UTC', mode: 'NEXT', now, taken });
        if (!result.ok) throw new Error('expected allocation');
        expect(result.at.toISOString()).toBe('2026-03-02T09:00:00.000Z');
        expect(result.displacements).toEqual([]);
    });

    it('never moves items earlier than the NEXT insertion point', () => {
        // 09:00 is held, 18:00 today is held, and an earlier item is already behind us.
        const taken = [takenAt('2026-03-02T09:00:00Z', 'x1'), takenAt('2026-03-02T18:00:00Z', 'x2')];
        const result = allocateSlot({ slots, timezone: 'UTC', mode: 'NEXT', now: new Date('2026-03-02T10:00:00Z'), taken });
        if (!result.ok) throw new Error('expected allocation');
        // 10:00 has passed 09:00, so the insertion point is today's 18:00 slot.
        expect(result.at.toISOString()).toBe('2026-03-02T18:00:00.000Z');
        expect(result.displacements.map(d => d.ref)).toEqual(['x2']);
    });

    it('reports NO_SLOTS when every slot is disabled', () => {
        const result = allocateSlot({ slots: [slot('a', [1], '09:00', false)], timezone: 'UTC', mode: 'AVAILABLE', now, taken: [] });
        expect(result).toEqual({ ok: false, error: 'NO_SLOTS' });
    });

    it('reports NO_CAPACITY when the queue is full, after widening the horizon once', () => {
        // 4 slots a day is far below what a 90+90 day horizon generates, so build
        // a queue whose entire output is already taken.
        const tight = [slot('a', [1], '09:00', true)];
        const horizonDays = 1;
        const until = new Date(now.getTime() + horizonDays * 864e5);
        const all = generateOccurrences(tight, 'UTC', now, new Date(now.getTime() + horizonDays * 2 * 864e5));
        const taken = all.map((o, i) => takenAt(o.at.toISOString(), `x${i}`));
        const result = allocateSlot({ slots: tight, timezone: 'UTC', mode: 'AVAILABLE', now, taken, horizonDays, until });
        expect(result).toEqual({ ok: false, error: 'NO_CAPACITY' });
    });

    it('does not place two items within the minimum gap', () => {
        const taken = [takenAt('2026-03-02T09:00:30Z', 'x1')];
        const result = allocateSlot({ slots: [slot('a', [0, 1, 2, 3, 4, 5, 6], '09:00', true)], timezone: 'UTC', mode: 'AVAILABLE', now, taken });
        if (!result.ok) throw new Error('expected allocation');
        expect(result.at.toISOString()).toBe('2026-03-03T09:00:00.000Z');
    });
});

describe('slots held by manually scheduled posts', () => {
    const now = new Date('2026-03-02T00:00:00Z');
    const slots = [slot('a', [0, 1, 2, 3, 4, 5, 6], '09:00', true), slot('b', [0, 1, 2, 3, 4, 5, 6], '18:00', true)];
    const externalAt = (iso: string) => ({ at: new Date(iso), ref: 'manual', owned: false });

    it('routes around them in AVAILABLE mode', () => {
        const result = allocateSlot({
            slots, timezone: 'UTC', mode: 'AVAILABLE', now, taken: [externalAt('2026-03-02T09:00:00Z')],
        });
        if (!result.ok) throw new Error('expected allocation');
        expect(result.at.toISOString()).toBe('2026-03-02T18:00:00.000Z');
    });

    it('never displaces them in NEXT mode', () => {
        const result = allocateSlot({
            slots, timezone: 'UTC', mode: 'NEXT', now,
            taken: [externalAt('2026-03-02T09:00:00Z'), { at: new Date('2026-03-02T18:00:00Z'), ref: 'mine' }],
        });
        if (!result.ok) throw new Error('expected allocation');
        // 09:00 is off-limits (held by a hand-scheduled post), so the post being
        // queued takes 18:00 and the queue's own item moves behind it.
        expect(result.at.toISOString()).toBe('2026-03-02T18:00:00.000Z');
        expect(result.displacements).toEqual([{
            from: new Date('2026-03-02T18:00:00Z'),
            to: new Date('2026-03-03T09:00:00Z'),
            ref: 'mine',
        }]);
    });

    it('does not land cascaded items on them', () => {
        const result = allocateSlot({
            slots, timezone: 'UTC', mode: 'NEXT', now,
            taken: [
                { at: new Date('2026-03-02T09:00:00Z'), ref: 'mine1' },
                { at: new Date('2026-03-02T18:00:00Z'), ref: 'mine2' },
                externalAt('2026-03-03T09:00:00Z'),
            ],
        });
        if (!result.ok) throw new Error('expected allocation');
        expect(result.at.toISOString()).toBe('2026-03-02T09:00:00.000Z');
        // mine1 takes 18:00, mine2 must skip the externally held Mar 3 09:00
        expect(result.displacements.map(d => [d.ref, d.to.toISOString()])).toEqual([
            ['mine1', '2026-03-02T18:00:00.000Z'],
            ['mine2', '2026-03-03T18:00:00.000Z'],
        ]);
    });
});

describe('previewOccurrences', () => {
it('marks which upcoming occurrences are occupied', () => {
        const result = previewOccurrences({
            slots: [slot('a', [0, 1, 2, 3, 4, 5, 6], '09:00', true)],
            timezone: 'UTC',
            from: new Date('2026-03-02T00:00:00Z'),
            until: new Date('2026-03-04T00:00:00Z'),
            taken: [{ at: new Date('2026-03-03T09:00:00Z'), ref: 'x1' }],
        });
        expect(result.map(o => o.taken)).toEqual([false, true]);
    });

    it('caps the preview length', () => {
        const result = previewOccurrences({
            slots: [slot('a', [0, 1, 2, 3, 4, 5, 6], '09:00', true)],
            timezone: 'UTC',
            from: new Date('2026-03-02T00:00:00Z'),
            until: new Date('2026-03-20T00:00:00Z'),
            taken: [],
            limit: 3,
        });
        expect(result).toHaveLength(3);
    });
});

describe('validateSlots', () => {
    it('rejects an empty template', () => {
        expect(validateSlots([])).toMatch(/at least one/);
    });

    it('rejects malformed times and empty day sets', () => {
        expect(validateSlots([{ daysOfWeek: [1], time: '9:00' }])).toMatch(/HH:mm/);
        expect(validateSlots([{ daysOfWeek: [], time: '09:00' }])).toMatch(/day of the week/);
        expect(validateSlots([{ daysOfWeek: [7], time: '09:00' }])).toMatch(/day of the week/);
    });

    it('accepts a sane template', () => {
        expect(validateSlots([{ daysOfWeek: [1, 2, 3], time: '09:30' }])).toBeNull();
    });
});
