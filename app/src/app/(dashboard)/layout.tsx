/**
 * Dashboard layout with sidebar and mobile bottom navigation
 * Wraps all dashboard pages with navigation
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Sidebar } from '@/components/layout/sidebar';
import { DashboardMain } from '@/components/layout/dashboard-main';
import { MobileBottomNav } from '@/components/mobile/bottom-nav';

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
        <div className="flex min-h-screen">
            {/* Desktop Sidebar - hidden on mobile */}
            <Sidebar user={user} />

            {/* Main content - syncs margin with sidebar state */}
            <DashboardMain>{children}</DashboardMain>

            {/* Mobile Bottom Navigation - hidden on desktop */}
            <MobileBottomNav />
        </div>
    );
}

