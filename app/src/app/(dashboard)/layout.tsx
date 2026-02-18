/**
 * Dashboard layout with sidebar and mobile bottom navigation
 * Wraps all dashboard pages with navigation and page transitions
 *
 * Why: Auth redirect is handled by middleware.ts (edge, no DB call).
 * Session data is fetched in a Suspense boundary so the page shell
 * (loading.tsx, DashboardMain) renders instantly while sidebar user
 * data streams in.
 */

import { Suspense } from 'react';
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

/**
 * Async server component that fetches session and renders Sidebar.
 * Why: Wrapped in Suspense so children render instantly while
 * session data streams in. Falls back to a skeleton sidebar.
 */
async function SidebarWithUser() {
    const [firstRun, session] = await Promise.all([
        isFirstRun(),
        getSession(),
    ]);

    if (firstRun) {
        redirect('/setup');
    }

    // Middleware handles the unauthenticated case, but keep as safety net
    if (!session?.user) {
        redirect('/login');
    }

    const user = {
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
        isSuperAdmin: session.user.isSuperAdmin,
    };

    return <Sidebar user={user} />;
}

/**
 * Minimal skeleton shown while SidebarWithUser streams in.
 * Why: Matches collapsed sidebar width (64px) to prevent layout shift.
 */
function SidebarSkeleton() {
    return (
        <aside className="hidden md:flex flex-col w-16 border-r border-[var(--border)] bg-[var(--bg-secondary)]" />
    );
}

export default function DashboardLayout({
    children,
    compose,
}: {
    children: React.ReactNode;
    compose: React.ReactNode;
}) {
    return (
        <>
            {/* ImpersonationBanner is rendered in root layout.tsx — no need to duplicate here */}

            <div className="flex min-h-screen">
                {/* Desktop Sidebar — Suspense boundary lets children render instantly */}
                <Suspense fallback={<SidebarSkeleton />}>
                    <SidebarWithUser />
                </Suspense>

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

