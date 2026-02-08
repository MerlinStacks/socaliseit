/**
 * Super Admin Layout
 * Dedicated layout with admin navigation and super admin auth guard
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import Link from 'next/link';
import {
    Building2,
    Users,
    LayoutDashboard,
    Settings,
    ArrowLeft,
    Shield,
    ScrollText,
    Key,
    Bot,
    Plug2,
    FlaskConical,
} from 'lucide-react';

/**
 * Why: Super admin layout provides isolated navigation for platform administration.
 * Auth guard at layout level prevents any child route from rendering without super admin access.
 */
export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    // Redirect if not authenticated
    if (!session?.user?.id) {
        redirect('/login');
    }

    // Check super admin status
    const user = await db.user.findUnique({
        where: { id: session.user.id },
        select: { isSuperAdmin: true, name: true, email: true },
    });

    // Redirect non-super-admins to dashboard
    if (!user?.isSuperAdmin) {
        redirect('/dashboard');
    }

    const navItems = [
        { href: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
        { href: '/admin/organizations', icon: Building2, label: 'Organizations' },
        { href: '/admin/users', icon: Users, label: 'Users' },
        { href: '/admin/logs', icon: ScrollText, label: 'Audit Logs' },
        { href: '/admin/settings', icon: Settings, label: 'Platform Settings' },
        { href: '/admin/platform-credentials', icon: Key, label: 'Platform Credentials' },
        { href: '/admin/ai-settings', icon: Bot, label: 'AI Settings' },
        { href: '/admin/integrations', icon: Plug2, label: 'API Integrations' },
        { href: '/admin/meta-api-tests', icon: FlaskConical, label: 'Meta API Tests' },
    ];

    return (
        <div className="min-h-screen bg-gray-950">
            {/* Admin Header */}
            <header className="sticky top-0 z-50 border-b border-red-900/30 bg-gray-950/95 backdrop-blur-sm">
                <div className="flex h-16 items-center justify-between px-6">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/dashboard"
                            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            <span className="text-sm">Back to App</span>
                        </Link>
                        <div className="h-6 w-px bg-gray-800" />
                        <div className="flex items-center gap-2">
                            <Shield className="h-5 w-5 text-red-500" />
                            <span className="font-semibold text-white">Super Admin</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-400">{user.email}</span>
                        <div className="h-8 w-8 rounded-full bg-red-500/20 flex items-center justify-center">
                            <span className="text-sm font-medium text-red-400">
                                {user.name?.charAt(0) || 'A'}
                            </span>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex">
                {/* Sidebar Navigation */}
                <nav className="sticky top-16 h-[calc(100vh-4rem)] w-64 border-r border-gray-800 bg-gray-950 p-4">
                    <ul className="space-y-1">
                        {navItems.map((item) => (
                            <li key={item.href}>
                                <Link
                                    href={item.href}
                                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-gray-400 hover:bg-gray-900 hover:text-white transition-colors"
                                >
                                    <item.icon className="h-5 w-5" />
                                    <span>{item.label}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>

                    <div className="mt-8 rounded-lg border border-red-900/30 bg-red-950/20 p-4">
                        <p className="text-xs text-red-400">
                            <strong>Warning:</strong> Changes made here affect all users and
                            organizations on the platform.
                        </p>
                    </div>
                </nav>

                {/* Main Content */}
                <main className="flex-1 p-8">{children}</main>
            </div>
        </div>
    );
}
