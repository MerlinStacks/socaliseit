/**
 * Dashboard layout with sidebar
 * Wraps all dashboard pages with navigation
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Sidebar } from '@/components/layout/sidebar';

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
    };

    return (
        <div className="flex min-h-screen">
            <Sidebar user={user} />
            <main className="flex-1 ml-[var(--sidebar-width)]">
                {children}
            </main>
        </div>
    );
}
