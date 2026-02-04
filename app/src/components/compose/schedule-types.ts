/**
 * Schedule Calendar Types
 * Shared types and constants for scheduling components.
 */

/**
 * Calendar post type for display
 */
export interface CalendarPost {
    id: string;
    time: string;
    caption: string;
    platform: string;
    status: string;
    thumbnail: string | null;
}

/**
 * Per-account schedule for separate scheduling mode
 */
export interface AccountSchedule {
    date: string; // yyyy-MM-dd format
    time: string; // HH:mm format
}

import { PLATFORM_COLORS } from '@/lib/platforms/ui';

// Derive bg colors from consolidated PLATFORM_COLORS
export const platformColors: Record<string, string> = Object.fromEntries(
    Object.entries(PLATFORM_COLORS).map(([k, v]) => [k, v.bg])
);



export const TIME_OPTIONS = [
    { value: '06:00', label: '6:00 AM' },
    { value: '07:00', label: '7:00 AM' },
    { value: '08:00', label: '8:00 AM' },
    { value: '09:00', label: '9:00 AM' },
    { value: '10:00', label: '10:00 AM' },
    { value: '11:00', label: '11:00 AM' },
    { value: '12:00', label: '12:00 PM' },
    { value: '13:00', label: '1:00 PM' },
    { value: '14:00', label: '2:00 PM' },
    { value: '15:00', label: '3:00 PM' },
    { value: '16:00', label: '4:00 PM' },
    { value: '17:00', label: '5:00 PM' },
    { value: '18:00', label: '6:00 PM' },
    { value: '19:00', label: '7:00 PM' },
    { value: '19:30', label: '7:30 PM' },
    { value: '20:00', label: '8:00 PM' },
    { value: '21:00', label: '9:00 PM' },
    { value: '22:00', label: '10:00 PM' },
];

/**
 * Get user's timezone abbreviation
 */
export function getTimezoneAbbr(): string {
    const now = new Date();
    const tzString = now.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop();
    return tzString || 'Local';
}

/**
 * Get user's full timezone string
 */
export function getTimezoneString(): string {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offset = -new Date().getTimezoneOffset();
    const hours = Math.floor(Math.abs(offset) / 60);
    const mins = Math.abs(offset) % 60;
    const sign = offset >= 0 ? '+' : '-';
    return `GMT ${sign}${hours}:${mins.toString().padStart(2, '0')} ${tz.replace('_', ' ')}`;
}
