/**
 * Dashboard layout with sidebar, SPA shell, and mobile bottom navigation.
 *
 * Architecture (SPA hybrid):
 * 1. Server layout fetches session ONCE and passes it to client providers.
 * 2. DashboardSPAShell intercepts sidebar clicks and swaps views client-side
 *    (instant, no server round-trip) for the 9 fully-client pages.
 * 3. SSR-only pages (dashboard, analytics, compose, etc.) still render via
 *    Next.js App Router as {children} on direct URL or hard refresh.
 * 4. DashboardSessionProvider shares session data so client pages never need
 *    to call getSession() themselves.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { isFirstRun } from '@/lib/first-run-check';
import { Sidebar } from '@/components/layout/sidebar';
import { DashboardMain } from '@/components/layout/dashboard-main';
import { MobileBottomNav } from '@/components/mobile/bottom-nav';
import { DashboardSPAShell, SPANavProvider } from '@/components/layout/dashboard-spa-shell';
import { DashboardSessionProvider, type DashboardSession } from '@/components/layout/session-provider';

import { AppBadgeSync } from '@/components/pwa/app-badge-sync';
import { PWAInitializer } from '@/components/pwa/pwa-initializer';
import { CrossTabSyncProvider } from '@/components/layout/cross-tab-sync-provider';

/**
 * Async server component that fetches session and renders Sidebar +
 * SessionProvider. Wrapped in Suspense so children render instantly
 * while session data streams in.
 */
async function DashboardProviders({ children }: { children: React.ReactNode }) {
    const [firstRun, session] = await Promise.all([
        isFirstRun(),
        getSession(),
    ]);

    if (firstRun) {
        redirect('/setup');
    }

    if (!session?.user) {
        redirect('/login');
    }

    const user = {
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
        isSuperAdmin: session.user.isSuperAdmin,
    };

    // Build session context once — shared with all client components
    const dashboardSession: DashboardSession = {
        userId: session.user.id,
        userName: session.user.name ?? 'User',
        userEmail: session.user.email ?? '',
        userImage: session.user.image ?? null,
        currentOrganizationId: session.user.currentOrganizationId ?? '',
        isSuperAdmin: session.user.isSuperAdmin ?? false,
    };

    return (
        <DashboardSessionProvider session={dashboardSession}>
            <SPANavProvider>
                <div className="flex min-h-screen">
                    {/* Desktop Sidebar */}
                    <Sidebar user={user} />

                    {/* Main content with SPA shell for instant navigation */}
                    <DashboardMain>
                        <DashboardSPAShell>{children}</DashboardSPAShell>
                    </DashboardMain>

                    {/* Mobile Bottom Navigation */}
                    <MobileBottomNav />
                </div>
            </SPANavProvider>
        </DashboardSessionProvider>
    );
}

/**
 * Minimal skeleton shown while DashboardProviders streams in.
 * Matches collapsed sidebar width (64px) to prevent layout shift.
 */
function LayoutSkeleton({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-screen">
            <aside className="hidden md:flex flex-col w-16 border-r border-[var(--border)] bg-[var(--bg-secondary)]" />
            <main className="flex-1 min-w-0">{children}</main>
        </div>
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
            <Suspense fallback={<LayoutSkeleton>{children}</LayoutSkeleton>}>
                <DashboardProviders>{children}</DashboardProviders>
            </Suspense>

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

