/**
 * Calendar Settings Store
 * Persists user preferences for calendar display: preview size, week start,
 * holidays, toggles for notes/external posts.
 *
 * Why: Centralises calendar display preferences in a single Zustand store
 * so all calendar components share the same settings without prop drilling.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Post preview display mode in month/week views */
export type PostPreviewMode = 'none' | 'small' | 'large' | 'condensed';

/** 0 = Sunday, 1 = Monday */
export type WeekStartDay = 0 | 1;

export interface CalendarSettings {
    /** How much post detail to show in calendar cells */
    postPreview: PostPreviewMode;
    /** Which day the week grid starts on */
    weekStartsOn: WeekStartDay;
    /** Active national holiday country codes (e.g. ['AU']) */
    nationalHolidays: string[];
    /** Active religious holiday categories (e.g. ['christian']) */
    religiousHolidays: string[];
    /** Whether to show fun / social-media holidays */
    showFunHolidays: boolean;
    /** Whether to display notes on the calendar */
    showNotes: boolean;
    /** Whether to display synced external posts */
    showExternalPosts: boolean;
}

interface CalendarSettingsState extends CalendarSettings {
    /** Update one or more settings fields */
    update: (partial: Partial<CalendarSettings>) => void;
    /** Toggle a national holiday country on/off */
    toggleNationalHoliday: (code: string) => void;
    /** Toggle a religious holiday category on/off */
    toggleReligiousHoliday: (category: string) => void;
}

const DEFAULTS: CalendarSettings = {
    postPreview: 'large',
    weekStartsOn: 1,
    nationalHolidays: ['AU'],
    religiousHolidays: [],
    showFunHolidays: false,
    showNotes: true,
    showExternalPosts: true,
};

export const useCalendarSettingsStore = create<CalendarSettingsState>()(
    persist(
        (set) => ({
            ...DEFAULTS,

            update: (partial) => set((state) => ({ ...state, ...partial })),

            toggleNationalHoliday: (code) =>
                set((state) => ({
                    nationalHolidays: state.nationalHolidays.includes(code)
                        ? state.nationalHolidays.filter((c) => c !== code)
                        : [...state.nationalHolidays, code],
                })),

            toggleReligiousHoliday: (category) =>
                set((state) => ({
                    religiousHolidays: state.religiousHolidays.includes(category)
                        ? state.religiousHolidays.filter((c) => c !== category)
                        : [...state.religiousHolidays, category],
                })),
        }),
        {
            name: 'socialiseit-calendar-settings',
        }
    )
);
