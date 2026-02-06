'use client';

/**
 * Main application sidebar with navigation
 * Features:
 * - Auto-collapse: collapsed by default, expands on hover
 * - Flat navigation without section headers
 * - Compact spacing to minimize scrolling
 * - Glassmorphism styling
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/lib/stores/sidebar-store';
import { clearAppBadge } from '@/hooks/use-app-badge';
import {
    Home,
    Calendar,
    Edit3 as Compose,
    Image,
    Film,
    BarChart3 as Analytics,
    Eye as Listening,
    Settings,
    LayoutGrid,
    Users as Competitors,
    Heart,
    TrendingUp,
    Users,
    Activity,
    LogOut,
    MessageSquare,
    Shield,
} from 'lucide-react';
import type { SidebarBadges } from '@/app/api/sidebar/badges/route';
import { OrganizationSwitcher } from './organization-switcher';

interface NavItem {
    label: string;
    href: string;
    icon: React.ElementType;
    /** Key to match against badge data (e.g., 'engagement', 'analytics') */
    badgeKey?: keyof SidebarBadges;
}

const navItems: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: Home },
    { label: 'Calendar', href: '/calendar', icon: Calendar },
    { label: 'Compose', href: '/compose', icon: Compose },
    { label: 'Engagement', href: '/engagement', icon: MessageSquare, badgeKey: 'engagement' },
    { label: 'Media', href: '/media', icon: Image },
    { label: 'Video Editor', href: '/video-editor', icon: Film },
    { label: 'Pillars', href: '/pillars', icon: LayoutGrid },
    { label: 'UGC', href: '/ugc', icon: Heart },
    { label: 'Trends', href: '/trends', icon: TrendingUp },
    { label: 'Analytics', href: '/analytics', icon: Analytics, badgeKey: 'analytics' },
    { label: 'Listening', href: '/listening', icon: Listening },
    { label: 'Competitors', href: '/competitors', icon: Competitors },
    { label: 'Team', href: '/team', icon: Users },
    { label: 'Activity', href: '/activity', icon: Activity },


    { label: 'Settings', href: '/settings', icon: Settings },
];

/** Collapsed sidebar width showing only icons */
const COLLAPSED_WIDTH = 64;
/** Expanded sidebar width showing icons + labels */
const EXPANDED_WIDTH = 220;

interface SidebarProps {
    user?: {
        name?: string | null;
        email?: string | null;
        image?: string | null;
        isSuperAdmin?: boolean;
    };
}

/**
 * Fetches sidebar badge counts from the API
 */
function useSidebarBadges() {
    return useQuery<SidebarBadges>({
        queryKey: ['sidebar-badges'],
        queryFn: async () => {
            const res = await fetch('/api/sidebar/badges');
            if (!res.ok) throw new Error('Failed to fetch badges');
            return res.json();
        },
        refetchInterval: 60_000,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
    });
}

export function Sidebar({ user }: SidebarProps) {
    const pathname = usePathname();
    const { data: badges } = useSidebarBadges();
    const { isExpanded, setExpanded } = useSidebarStore();

    return (
        <aside
            onMouseEnter={() => setExpanded(true)}
            onMouseLeave={() => setExpanded(false)}
            style={{ width: isExpanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH }}
            className={cn(
                'fixed left-0 top-0 z-40 hidden h-screen flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)] md:flex',
                'transition-[width] duration-200 ease-out'
            )}
        >
            {/* Logo */}
            <div className="flex items-center gap-3 px-4 py-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient">
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                    >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                        <line x1="9" y1="9" x2="9.01" y2="9" />
                        <line x1="15" y1="9" x2="15.01" y2="9" />
                    </svg>
                </div>
                {isExpanded && (
                    <span className="whitespace-nowrap text-base font-bold text-gradient">
                        Overseek Socials
                    </span>
                )}
            </div>

            {/* Organization Switcher */}
            <OrganizationSwitcher isExpanded={isExpanded} />

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto px-2 py-1">
                <ul className="space-y-0.5">
                    {navItems.map((item) => {
                        const isActive =
                            pathname === item.href || pathname.startsWith(`${item.href}/`);
                        const Icon = item.icon;
                        const badgeCount = item.badgeKey ? badges?.[item.badgeKey] : undefined;

                        return (
                            <li key={item.href}>
                                <Link
                                    href={item.href}
                                    title={!isExpanded ? item.label : undefined}
                                    className={cn(
                                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                        isActive
                                            ? 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)]'
                                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                                    )}
                                >
                                    <Icon className="h-5 w-5 shrink-0" />
                                    {isExpanded && (
                                        <>
                                            <span className="flex-1 truncate">{item.label}</span>
                                            {badgeCount !== undefined && badgeCount > 0 && (
                                                <BadgePill count={badgeCount} />
                                            )}
                                        </>
                                    )}
                                    {!isExpanded && badgeCount !== undefined && badgeCount > 0 && (
                                        <span className="absolute right-1 top-0.5 h-2 w-2 rounded-full bg-[var(--accent-gold)]" />
                                    )}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            {/* Super Admin Link */}
            {user?.isSuperAdmin && (
                <div className="border-t border-[var(--border)] px-2 py-2">
                    <Link
                        href="/admin"
                        title={!isExpanded ? 'Super Admin' : undefined}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10"
                    >
                        <Shield className="h-5 w-5 shrink-0" />
                        {isExpanded && <span>Super Admin</span>}
                    </Link>
                </div>
            )}

            {/* User Section */}
            <div className="border-t border-[var(--border)] px-2 py-3">
                <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient text-sm font-semibold text-white">
                        {user?.name?.charAt(0) ?? user?.email?.charAt(0) ?? 'U'}
                    </div>
                    {isExpanded && (
                        <>
                            <div className="flex-1 truncate">
                                <p className="truncate text-sm font-medium">{user?.name ?? 'User'}</p>
                                <p className="truncate text-xs text-[var(--text-muted)]">
                                    {user?.email ?? 'user@example.com'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={async () => {
                                    // Clear app icon badge before signing out
                                    await clearAppBadge();
                                    signOut({ callbackUrl: '/login' });
                                }}
                                className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--error)]"
                                title="Sign out"
                            >
                                <LogOut className="h-4 w-4" />
                            </button>
                        </>
                    )}
                </div>
            </div>
        </aside>
    );
}

/**
 * Notification badge pill component
 */
function BadgePill({ count }: { count: number }) {
    return (
        <span
            className={cn(
                'flex h-4 min-w-4 items-center justify-center rounded-full px-1',
                'bg-[var(--accent-gold)] text-[10px] font-semibold text-white'
            )}
        >
            {count > 99 ? '99+' : count}
        </span>
    );
}
