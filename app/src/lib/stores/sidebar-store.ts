/**
 * Sidebar State Store
 * Manages sidebar expand/collapse state with hover behavior
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarState {
    /** Whether the sidebar is currently expanded (hovered) */
    isExpanded: boolean;
    /** Set expanded state */
    setExpanded: (expanded: boolean) => void;
}

export const useSidebarStore = create<SidebarState>()(
    persist(
        (set) => ({
            isExpanded: false,

            setExpanded: (expanded) => set({ isExpanded: expanded }),
        }),
        {
            name: 'socialiseit-sidebar',
            partialize: () => ({}), // Don't persist expanded state
        }
    )
);
