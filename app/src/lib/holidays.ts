/**
 * Holiday Data Module
 * Static holiday definitions for Australian national, religious, and fun holidays.
 *
 * Why: Provides calendar day badges without any external API dependency.
 * Dates are expressed as MM-DD strings for fixed holidays, or computed
 * functions for moveable feasts (Easter, etc.).
 */

export interface Holiday {
    /** Display name */
    name: string;
    /** Date as MM-DD (fixed) or full ISO (computed) */
    date: string;
    /** Category for filtering */
    category: 'national' | 'religious' | 'fun';
    /** Country code (national only) */
    country?: string;
    /** Religious sub-category */
    religion?: string;
    /** Emoji icon for badge */
    emoji: string;
}

// ---------------------------------------------------------------------------
// National Holidays — Australia
// ---------------------------------------------------------------------------

/** Why: Per-year caches avoid recomputing holiday arrays 30-42× per month render */
const _nationalCache = new Map<number, Holiday[]>();
const _religiousCache = new Map<number, Holiday[]>();
const _funCache = new Map<number, Holiday[]>();

/**
 * Get Australian national holidays for a given year.
 * Why: Most are fixed dates; some (Easter, Queen's Birthday) are moveable.
 */
function getAustralianHolidays(year: number): Holiday[] {
    const cached = _nationalCache.get(year);
    if (cached) return cached;

    const easter = computeEasterDate(year);
    const goodFriday = offsetDate(easter, -2);
    const easterSaturday = offsetDate(easter, -1);
    const easterMonday = offsetDate(easter, 1);

    // Queen's/King's Birthday: 2nd Monday of June
    const kingsBirthday = nthWeekday(year, 5, 1, 2); // month 5 = June (0-indexed)

    const holidays: Holiday[] = [
        { name: "New Year's Day", date: `${year}-01-01`, category: 'national', country: 'AU', emoji: '🎆' },
        { name: 'Australia Day', date: `${year}-01-26`, category: 'national', country: 'AU', emoji: '🇦🇺' },
        { name: 'Good Friday', date: formatDate(goodFriday), category: 'national', country: 'AU', emoji: '✝️' },
        { name: 'Easter Saturday', date: formatDate(easterSaturday), category: 'national', country: 'AU', emoji: '🐣' },
        { name: 'Easter Sunday', date: formatDate(easter), category: 'national', country: 'AU', emoji: '🐣' },
        { name: 'Easter Monday', date: formatDate(easterMonday), category: 'national', country: 'AU', emoji: '🐣' },
        { name: 'Anzac Day', date: `${year}-04-25`, category: 'national', country: 'AU', emoji: '🌺' },
        { name: "King's Birthday", date: formatDate(kingsBirthday), category: 'national', country: 'AU', emoji: '👑' },
        { name: 'Christmas Day', date: `${year}-12-25`, category: 'national', country: 'AU', emoji: '🎄' },
        { name: 'Boxing Day', date: `${year}-12-26`, category: 'national', country: 'AU', emoji: '🎁' },
    ];
    _nationalCache.set(year, holidays);
    return holidays;
}

// ---------------------------------------------------------------------------
// Religious Holidays (multi-faith)
// ---------------------------------------------------------------------------

function getReligiousHolidays(year: number): Holiday[] {
    const cached = _religiousCache.get(year);
    if (cached) return cached;

    const easter = computeEasterDate(year);

    const holidays: Holiday[] = [
        // Christian
        { name: 'Ash Wednesday', date: formatDate(offsetDate(easter, -46)), category: 'religious', religion: 'christian', emoji: '✝️' },
        { name: 'Palm Sunday', date: formatDate(offsetDate(easter, -7)), category: 'religious', religion: 'christian', emoji: '🌿' },
        { name: 'Easter Sunday', date: formatDate(easter), category: 'religious', religion: 'christian', emoji: '✝️' },
        { name: 'Pentecost', date: formatDate(offsetDate(easter, 49)), category: 'religious', religion: 'christian', emoji: '🕊️' },
        { name: 'Christmas', date: `${year}-12-25`, category: 'religious', religion: 'christian', emoji: '🎄' },

        // Jewish (approximate — fixed to Gregorian for simplicity)
        { name: 'Passover (approx)', date: `${year}-04-13`, category: 'religious', religion: 'jewish', emoji: '✡️' },
        { name: 'Rosh Hashanah (approx)', date: `${year}-09-16`, category: 'religious', religion: 'jewish', emoji: '🍎' },
        { name: 'Yom Kippur (approx)', date: `${year}-09-25`, category: 'religious', religion: 'jewish', emoji: '✡️' },
        { name: 'Hanukkah (approx)', date: `${year}-12-15`, category: 'religious', religion: 'jewish', emoji: '🕎' },

        // Islamic (approximate — shifts ~11 days/year)
        { name: 'Eid al-Fitr (approx)', date: `${year}-04-10`, category: 'religious', religion: 'islamic', emoji: '☪️' },
        { name: 'Eid al-Adha (approx)', date: `${year}-06-17`, category: 'religious', religion: 'islamic', emoji: '☪️' },

        // Hindu
        { name: 'Diwali (approx)', date: `${year}-10-21`, category: 'religious', religion: 'hindu', emoji: '🪔' },
        { name: 'Holi (approx)', date: `${year}-03-14`, category: 'religious', religion: 'hindu', emoji: '🎨' },

        // Buddhist
        { name: 'Vesak (approx)', date: `${year}-05-12`, category: 'religious', religion: 'buddhist', emoji: '☸️' },
    ];
    _religiousCache.set(year, holidays);
    return holidays;
}

// ---------------------------------------------------------------------------
// Fun / Social Media Holidays
// ---------------------------------------------------------------------------

function getFunHolidays(year: number): Holiday[] {
    const cached = _funCache.get(year);
    if (cached) return cached;

    const holidays: Holiday[] = [
        { name: 'National Compliment Day', date: `${year}-01-24`, category: 'fun', emoji: '💬' },
        { name: 'World Nutella Day', date: `${year}-02-05`, category: 'fun', emoji: '🍫' },
        { name: 'Galentine\'s Day', date: `${year}-02-13`, category: 'fun', emoji: '💕' },
        { name: 'Valentine\'s Day', date: `${year}-02-14`, category: 'fun', emoji: '❤️' },
        { name: 'National Pizza Day', date: `${year}-02-09`, category: 'fun', emoji: '🍕' },
        { name: 'International Women\'s Day', date: `${year}-03-08`, category: 'fun', emoji: '💪' },
        { name: 'Pi Day', date: `${year}-03-14`, category: 'fun', emoji: '🥧' },
        { name: 'World Sleep Day', date: `${year}-03-15`, category: 'fun', emoji: '😴' },
        { name: 'April Fools\' Day', date: `${year}-04-01`, category: 'fun', emoji: '🤡' },
        { name: 'Earth Day', date: `${year}-04-22`, category: 'fun', emoji: '🌍' },
        { name: 'Star Wars Day', date: `${year}-05-04`, category: 'fun', emoji: '⭐' },
        { name: 'World Emoji Day', date: `${year}-07-17`, category: 'fun', emoji: '😀' },
        { name: 'International Cat Day', date: `${year}-08-08`, category: 'fun', emoji: '🐱' },
        { name: 'International Dog Day', date: `${year}-08-26`, category: 'fun', emoji: '🐶' },
        { name: 'International Coffee Day', date: `${year}-10-01`, category: 'fun', emoji: '☕' },
        { name: 'World Mental Health Day', date: `${year}-10-10`, category: 'fun', emoji: '🧠' },
        { name: 'Halloween', date: `${year}-10-31`, category: 'fun', emoji: '🎃' },
        { name: 'Singles Day', date: `${year}-11-11`, category: 'fun', emoji: '💎' },
        { name: 'Black Friday (approx)', date: `${year}-11-28`, category: 'fun', emoji: '🛍️' },
        { name: 'Cyber Monday (approx)', date: `${year}-12-01`, category: 'fun', emoji: '💻' },
        { name: 'New Year\'s Eve', date: `${year}-12-31`, category: 'fun', emoji: '🥂' },
    ];
    _funCache.set(year, holidays);
    return holidays;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Available national holiday country options */
export const NATIONAL_HOLIDAY_OPTIONS = [
    { code: 'AU', label: 'Holidays in Australia' },
] as const;

/** Available religious holiday categories */
export const RELIGIOUS_HOLIDAY_OPTIONS = [
    { code: 'christian', label: 'Christian' },
    { code: 'jewish', label: 'Jewish' },
    { code: 'islamic', label: 'Islamic' },
    { code: 'hindu', label: 'Hindu' },
    { code: 'buddhist', label: 'Buddhist' },
] as const;

export interface CalendarHolidaySettings {
    nationalHolidays: string[];
    religiousHolidays: string[];
    showFunHolidays: boolean;
}

/**
 * Get all holidays matching active settings for the given date (YYYY-MM-DD).
 * Why: Calendar views call this per-day to render holiday badges.
 */
export function getHolidaysForDate(
    dateKey: string,
    settings: CalendarHolidaySettings
): Holiday[] {
    const year = parseInt(dateKey.substring(0, 4), 10);
    if (isNaN(year)) return [];

    const results: Holiday[] = [];

    // National
    if (settings.nationalHolidays.length > 0) {
        const national = getAustralianHolidays(year);
        for (const h of national) {
            if (
                settings.nationalHolidays.includes(h.country || '') &&
                h.date === dateKey
            ) {
                results.push(h);
            }
        }
    }

    // Religious
    if (settings.religiousHolidays.length > 0) {
        const religious = getReligiousHolidays(year);
        for (const h of religious) {
            if (
                settings.religiousHolidays.includes(h.religion || '') &&
                h.date === dateKey
            ) {
                results.push(h);
            }
        }
    }

    // Fun
    if (settings.showFunHolidays) {
        const fun = getFunHolidays(year);
        for (const h of fun) {
            if (h.date === dateKey) {
                results.push(h);
            }
        }
    }

    return results;
}

// ---------------------------------------------------------------------------
// Date Helpers
// ---------------------------------------------------------------------------

/**
 * Compute Easter Sunday using the Anonymous Gregorian algorithm.
 * Why: Easter is the anchor for many Christian moveable feasts.
 */
function computeEasterDate(year: number): Date {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
}

/** Add or subtract days from a date */
function offsetDate(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

/** Format a Date as YYYY-MM-DD */
function formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Get the nth occurrence of a weekday in a given month.
 * Why: Used for holidays like "2nd Monday of June".
 * @param month 0-indexed (0 = January)
 * @param weekday 0 = Sunday, 1 = Monday, etc.
 * @param nth 1-based (1 = first occurrence)
 */
function nthWeekday(year: number, month: number, weekday: number, nth: number): Date {
    const first = new Date(year, month, 1);
    let dayOffset = weekday - first.getDay();
    if (dayOffset < 0) dayOffset += 7;
    const day = 1 + dayOffset + (nth - 1) * 7;
    return new Date(year, month, day);
}
