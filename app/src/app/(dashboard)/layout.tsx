/**
 * Dashboard layout with sidebar and mobile bottom navigation
 * Wraps all dashboard pages with navigation and page transitions
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { isFirstRun } from '@/lib/first-run-check';
import { Sidebar } from '@/components/layout/sidebar';
import { DashboardMain } from '@/components/layout/dashboard-main';
import { MobileBottomNav } from '@/components/mobile/bottom-nav';
import { PageTransitionWrapper } from '@/components/layout/page-transition-wrapper';

import { AppBadgeSync } from '@/components/pwa/app-badge-sync';
import { PWAInitializer } from '@/components/pwa/pwa-initializer';

export default async function DashboardLayout({
    children,
    compose,
}: {
    children: React.ReactNode;
    compose: React.ReactNode;
}) {
    // First-run: redirect to setup wizard before demanding login
    const firstRun = await isFirstRun();
    if (firstRun) {
        redirect('/setup');
    }

    const session = await auth();

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
        </>
    );
}
