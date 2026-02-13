/**
 * Dashboard layout with sidebar and mobile bottom navigation
 * Wraps all dashboard pages with navigation and page transitions
 */

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { isFirstRun } from '@/lib/first-run-check';
import { Sidebar } from '@/components/layout/sidebar';
import { DashboardMain } from '@/components/layout/dashboard-main';
import { MobileBottomNav } from '@/components/mobile/bottom-nav';
import { PageTransitionWrapper } from '@/components/layout/page-transition-wrapper';

import { AppBadgeSync } from '@/components/pwa/app-badge-sync';
import { PWAInitializer } from '@/components/pwa/pwa-initializer';
import { CrossTabSyncProvider } from '@/components/layout/cross-tab-sync-provider';

export default async function DashboardLayout({
    children,
    compose,
}: {
    children: React.ReactNode;
    compose: React.ReactNode;
}) {
    // Parallelize: isFirstRun and getSession are independent
    const [firstRun, session] = await Promise.all([
        isFirstRun(),
        getSession(),
    ]);

    if (firstRun) {
        redirect('/setup');
    }

    // Redirect to login if not authenticated
    if (!session?.user) {
        redirect('/login');
    }

    const user = {
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
        isSuperAdmin: session.user.isSuperAdmin,
    };

    return (
        <>
            {/* ImpersonationBanner is rendered in root layout.tsx — no need to duplicate here */}

            <div className="flex min-h-screen">
                {/* Desktop Sidebar - hidden on mobile */}
                <Sidebar user={user} />

                {/* Main content - syncs margin with sidebar state */}
                <DashboardMain>
                    <PageTransitionWrapper>{children}</PageTransitionWrapper>
                </DashboardMain>

                {/* Mobile Bottom Navigation - hidden on desktop */}
                <MobileBottomNav />
            </div>

            {/* Compose modal overlay — rendered by intercepting route */}
            {compose}

            {/* App Badge Sync - updates app icon badge with unread count */}
            <AppBadgeSync />

            {/* PWA Initializer - registers periodic sync and handles SW messages */}
            <PWAInitializer />

            {/* Cross-tab sync - invalidates React Query caches when other tabs mutate data */}
            <CrossTabSyncProvider />
        </>
    );
}
