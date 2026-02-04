/**
 * Seasonal Scheduling Adjustments
 * 
 * Applies seasonal modifiers to posting time recommendations based on:
 * - Time of year (summer vs winter behavior patterns)
 * - Holidays and special events
 * - Weekend vs weekday patterns
 * 
 * Why: User behavior shifts with seasons. Summer evenings run later,
 * winter sees earlier engagement peaks, holidays have unique patterns.
 */

import { getMonth, getDay } from 'date-fns';

export type Season = 'spring' | 'summer' | 'fall' | 'winter';

/**
 * Get current season based on month (Northern Hemisphere by default)
 * Can be inverted for Southern Hemisphere using the timezone
 */
export function getCurrentSeason(date: Date = new Date(), southernHemisphere = false): Season {
    const month = getMonth(date); // 0-11

    let season: Season;
    if (month >= 2 && month <= 4) season = 'spring';      // Mar-May
    else if (month >= 5 && month <= 7) season = 'summer'; // Jun-Aug
    else if (month >= 8 && month <= 10) season = 'fall';  // Sep-Nov
    else season = 'winter'; // Dec-Feb

    // Invert for Southern Hemisphere
    if (southernHemisphere) {
        const mapping: Record<Season, Season> = {
            spring: 'fall',
            summer: 'winter',
            fall: 'spring',
            winter: 'summer'
        };
        season = mapping[season];
    }

    return season;
}

/**
 * Get hour offset based on season
 * Summer: Later activity (+1 hour for evening posts)
 * Winter: Earlier engagement (-1 hour for afternoon/evening posts)
 */
export function getSeasonalHourOffset(hour: number, season: Season): number {
    // Only adjust afternoon/evening posts (after 14:00)
    if (hour < 14) return 0;

    switch (season) {
        case 'summer':
            return 1; // Push evening posts 1 hour later
        case 'winter':
            return -1; // Pull evening posts 1 hour earlier
        default:
            return 0; // No adjustment for spring/fall
    }
}

/**
 * Check if a given date is a major holiday
 */
export function isHoliday(date: Date): { isHoliday: boolean; name?: string } {
    const month = getMonth(date);
    const day = date.getDate();

    // Major US holidays (month is 0-indexed: 0=Jan, 11=Dec)
    const holidays: Array<{ month: number; day: number; name: string }> = [
        { month: 0, day: 1, name: "New Year's Day" },
        { month: 1, day: 14, name: "Valentine's Day" },
        { month: 6, day: 4, name: "Independence Day" },
        { month: 9, day: 31, name: "Halloween" }, // October 31
        { month: 11, day: 25, name: "Christmas" },
        { month: 11, day: 31, name: "New Year's Eve" },
    ];

    const match = holidays.find(h => h.month === month && h.day === day);
    return match ? { isHoliday: true, name: match.name } : { isHoliday: false };
}

/**
 * Get posting recommendations for holidays
 */
export function getHolidayRecommendation(holidayName: string): {
    suggestEarlyPost: boolean;
    suggestLatePost: boolean;
    peakHours: number[];
} {
    switch (holidayName) {
        case "New Year's Day":
        case "New Year's Eve":
            return { suggestEarlyPost: false, suggestLatePost: true, peakHours: [12, 18, 22] };
        case "Valentine's Day":
            return { suggestEarlyPost: true, suggestLatePost: true, peakHours: [8, 12, 18] };
        case "Independence Day":
            return { suggestEarlyPost: true, suggestLatePost: true, peakHours: [10, 14, 20] };
        case "Halloween":
            return { suggestEarlyPost: false, suggestLatePost: true, peakHours: [17, 19, 21] };
        case "Christmas":
            return { suggestEarlyPost: true, suggestLatePost: false, peakHours: [9, 12, 16] };
        default:
            return { suggestEarlyPost: true, suggestLatePost: true, peakHours: [9, 12, 17] };
    }
}

/**
 * Apply seasonal adjustments to a recommendation
 */
export function applySeasonalAdjustments(
    hour: number,
    date: Date,
    timezone?: string
): { adjustedHour: number; reason?: string } {
    // Check if timezone suggests Southern Hemisphere
    const southernHemisphere = timezone?.includes('Australia') ||
        timezone?.includes('Auckland') ||
        timezone?.includes('Buenos_Aires') ||
        timezone?.includes('Johannesburg');

    const season = getCurrentSeason(date, southernHemisphere);
    const offset = getSeasonalHourOffset(hour, season);

    const adjustedHour = Math.max(6, Math.min(23, hour + offset));

    if (offset !== 0) {
        return {
            adjustedHour,
            reason: `Adjusted for ${season} (${offset > 0 ? '+' : ''}${offset}h)`
        };
    }

    return { adjustedHour: hour };
}

/**
 * Check if weekend patterns should apply
 */
export function isWeekend(date: Date): boolean {
    const day = getDay(date);
    return day === 0 || day === 6;
}

/**
 * Get weekend hour adjustments
 * Weekends typically see later morning activity
 */
export function getWeekendHourOffset(hour: number): number {
    // Morning posts on weekends should be pushed later
    if (hour >= 6 && hour <= 10) {
        return 2; // 8am becomes 10am, etc.
    }
    return 0;
}
