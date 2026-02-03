/**
 * Sidebar State Store
 * Manages collapsible section states with localStorage persistence
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarState {
    /** Map of section IDs to their collapsed state */
    collapsedSections: Record<string, boolean>;
    /** Toggle a section's collapsed state */
    toggleSection: (sectionId: string) => void;
    /** Explicitly set a section's collapsed state */
    setCollapsed: (sectionId: string, collapsed: boolean) => void;
    /** Check if a section is collapsed */
    isCollapsed: (sectionId: string) => boolean;
}

export const useSidebarStore = create<SidebarState>()(
    persist(
        (set, get) => ({
            collapsedSections: {},

            toggleSection: (sectionId) =>
                set((state) => ({
                    collapsedSections: {
                        ...state.collapsedSections,
                        [sectionId]: !state.collapsedSections[sectionId],
                    },
                })),

            setCollapsed: (sectionId, collapsed) =>
                set((state) => ({
                    collapsedSections: {
                        ...state.collapsedSections,
                        [sectionId]: collapsed,
                    },
                })),

            isCollapsed: (sectionId) => get().collapsedSections[sectionId] ?? false,
        }),
        {
            name: 'socialiseit-sidebar',
            partialize: (state) => ({ collapsedSections: state.collapsedSections }),
        }
    )
);
