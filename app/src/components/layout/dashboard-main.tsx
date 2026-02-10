'use client';

/**
 * Dashboard main content wrapper
 * Handles dynamic margin based on sidebar expand/collapse state
 */

import { useSidebarStore } from '@/lib/stores/sidebar-store';
import { MobileBottomNavSpacer } from '@/components/mobile/bottom-nav';

/** Must match the values in sidebar.tsx */
const COLLAPSED_WIDTH = 64;
const EXPANDED_WIDTH = 220;

interface DashboardMainProps {
    children: React.ReactNode;
}

export function DashboardMain({ children }: DashboardMainProps) {
    const { isExpanded } = useSidebarStore();

    return (
        <main
            style={{ marginLeft: isExpanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH }}
            className="flex-1 min-w-0 overflow-x-hidden transition-[margin-left] duration-200 ease-out max-md:!ml-0"
        >
            {children}
            <MobileBottomNavSpacer />
        </main>
    );
}
