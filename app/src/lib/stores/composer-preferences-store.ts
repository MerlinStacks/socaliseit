/**
 * Composer Preferences Store
 * Persists the last-selected account IDs so the post composer can pre-select
 * the same platforms on the next new-post session.
 *
 * Why: Avoids forcing users to re-select their accounts every time they
 * open the composer for a new post. Uses Zustand + persist (localStorage)
 * following the same pattern as calendar-settings-store.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ComposerPreferencesState {
    /** Account IDs that were selected in the previous compose session */
    lastSelectedAccountIds: string[];
    /** Persist the current selection for future sessions */
    setLastSelectedAccountIds: (ids: string[]) => void;
}

export const useComposerPreferencesStore = create<ComposerPreferencesState>()(
    persist(
        (set) => ({
            lastSelectedAccountIds: [],

            setLastSelectedAccountIds: (ids) =>
                set({ lastSelectedAccountIds: ids }),
        }),
        {
            name: 'socialiseit-composer-prefs',
        }
    )
);
