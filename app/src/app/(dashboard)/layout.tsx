/**
 * Dashboard layout with sidebar and mobile bottom navigation
 * Wraps all dashboard pages with navigation and page transitions
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Sidebar } from '@/components/layout/sidebar';
import { DashboardMain } from '@/components/layout/dashboard-main';
import { MobileBottomNav } from '@/components/mobile/bottom-nav';
import ImpersonationBanner from '@/components/admin/ImpersonationBanner';
import { PageTransitionWrapper } from '@/components/layout/page-transition-wrapper';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import { AppBadgeSync } from '@/components/pwa/app-badge-sync';
import { PWAInitializer } from '@/components/pwa/pwa-initializer';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
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
            {/* Impersonation banner - shows when super admin is viewing as another user */}
            <ImpersonationBanner />

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

            {/* PWA Install Prompt - shows on eligible visits */}
            <InstallPrompt />

            {/* App Badge Sync - updates app icon badge with unread count */}
            <AppBadgeSync />

            {/* PWA Initializer - registers periodic sync and handles SW messages */}
            <PWAInitializer />
        </>
    );
}
