'use client';

/**
 * Main application sidebar with navigation
 * Uses workspace context for branding customization
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
    Home,
    Calendar,
    Edit3 as Compose,
    Image,
    Film,
    BarChart3 as Analytics,
    Eye as Listening,
    Settings,
    Zap,
    LayoutGrid,
    Users as Competitors,
    Heart,
    TrendingUp,
    Users,
    Activity,
    FileSpreadsheet,
    LogOut,
    MessageSquare,
} from 'lucide-react';

interface NavItem {
    label: string;
    href: string;
    icon: React.ElementType;
}

const mainNavItems: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: Home },
    { label: 'Calendar', href: '/calendar', icon: Calendar },
    { label: 'Compose', href: '/compose', icon: Compose },
    { label: 'Engagement', href: '/engagement', icon: MessageSquare },
    { label: 'Media', href: '/media', icon: Image },
    { label: 'Video Editor', href: '/video-editor', icon: Film },
];

const strategyNavItems: NavItem[] = [
    { label: 'Pillars', href: '/pillars', icon: LayoutGrid },
    { label: 'UGC', href: '/ugc', icon: Heart },
    { label: 'Trends', href: '/trends', icon: TrendingUp },
];

const insightNavItems: NavItem[] = [
    { label: 'Analytics', href: '/analytics', icon: Analytics },
    { label: 'Listening', href: '/listening', icon: Listening },
    { label: 'Competitors', href: '/competitors', icon: Competitors },
];

const teamNavItems: NavItem[] = [
    { label: 'Team', href: '/team', icon: Users },
    { label: 'Activity', href: '/activity', icon: Activity },
];

const toolsNavItems: NavItem[] = [
    { label: 'Automations', href: '/automations', icon: Zap },
    { label: 'Import', href: '/import', icon: FileSpreadsheet },
    { label: 'Settings', href: '/settings', icon: Settings },
];

interface SidebarProps {
    user?: {
        name?: string | null;
        email?: string | null;
        image?: string | null;
    };
}

export function Sidebar({ user }: SidebarProps) {
    const pathname = usePathname();

    return (
        <aside className="fixed left-0 top-0 z-40 flex h-screen w-[var(--sidebar-width)] flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)]">
            {/* Logo */}
            <div className="flex items-center gap-3 px-6 py-6">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient">
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-5 w-5"
                    >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                        <line x1="9" y1="9" x2="9.01" y2="9" />
                        <line x1="15" y1="9" x2="15.01" y2="9" />
                    </svg>
                </div>
                <span className="text-lg font-bold text-gradient">SocialiseIT</span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-4 overflow-y-auto px-4 py-2">
                <NavSection label="Main" items={mainNavItems} currentPath={pathname} />
                <NavSection label="Strategy" items={strategyNavItems} currentPath={pathname} />
                <NavSection label="Insights" items={insightNavItems} currentPath={pathname} />
                <NavSection label="Team" items={teamNavItems} currentPath={pathname} />
                <NavSection label="Tools" items={toolsNavItems} currentPath={pathname} />
            </nav>

            {/* User Section */}
            <div className="border-t border-[var(--border)] px-4 py-4">
                <div className="flex items-center gap-3 rounded-lg px-3 py-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient text-sm font-semibold text-white">
                        {user?.name?.charAt(0) ?? user?.email?.charAt(0) ?? 'U'}
                    </div>
                    <div className="flex-1 truncate">
                        <p className="truncate text-sm font-medium">{user?.name ?? 'User'}</p>
                        <p className="truncate text-xs text-[var(--text-muted)]">
                            {user?.email ?? 'user@example.com'}
                        </p>
                    </div>
                    <form action="/api/auth/signout" method="POST">
                        <button
                            type="submit"
                            className="rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--error)]"
                            title="Sign out"
                        >
                            <LogOut className="h-4 w-4" />
                        </button>
                    </form>
                </div>
            </div>
        </aside>
    );
}

interface NavSectionProps {
    label: string;
    items: NavItem[];
    currentPath: string;
}

function NavSection({ label, items, currentPath }: NavSectionProps) {
    return (
        <div>
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {label}
            </p>
            <ul className="space-y-1">
                {items.map((item) => {
                    const isActive = currentPath === item.href || currentPath.startsWith(`${item.href}/`);
                    const Icon = item.icon;

                    return (
                        <li key={item.href}>
                            <Link
                                href={item.href}
                                className={cn(
                                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                                    isActive
                                        ? 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)]'
                                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                                )}
                            >
                                <Icon className="h-5 w-5" />
                                {item.label}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
