'use client';

/**
 * Main application sidebar with navigation
 * Features:
 * - Collapsible sections with localStorage persistence
 * - Notification badges for engagement and analytics
 * - Glassmorphism styling
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/lib/stores/sidebar-store';
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
    ChevronDown,
} from 'lucide-react';
import type { SidebarBadges } from '@/app/api/sidebar/badges/route';

interface NavItem {
    label: string;
    href: string;
    icon: React.ElementType;
    /** Key to match against badge data (e.g., 'engagement', 'analytics') */
    badgeKey?: keyof SidebarBadges;
}

const mainNavItems: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: Home },
    { label: 'Calendar', href: '/calendar', icon: Calendar },
    { label: 'Compose', href: '/compose', icon: Compose },
    { label: 'Engagement', href: '/engagement', icon: MessageSquare, badgeKey: 'engagement' },
    { label: 'Media', href: '/media', icon: Image },
    { label: 'Video Editor', href: '/video-editor', icon: Film },
];

const strategyNavItems: NavItem[] = [
    { label: 'Pillars', href: '/pillars', icon: LayoutGrid },
    { label: 'UGC', href: '/ugc', icon: Heart },
    { label: 'Trends', href: '/trends', icon: TrendingUp },
];

const insightNavItems: NavItem[] = [
    { label: 'Analytics', href: '/analytics', icon: Analytics, badgeKey: 'analytics' },
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
        // Poll every 60 seconds to keep badges fresh
        refetchInterval: 60_000,
        // Don't refetch when window regains focus (too aggressive)
        refetchOnWindowFocus: false,
        // Cache for 30 seconds
        staleTime: 30_000,
    });
}

export function Sidebar({ user }: SidebarProps) {
    const pathname = usePathname();
    const { data: badges } = useSidebarBadges();

    return (
        <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[var(--sidebar-width)] flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)] md:flex">
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
            <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-2">
                <NavSection sectionId="main" label="Main" items={mainNavItems} currentPath={pathname} badges={badges} />
                <NavSection sectionId="strategy" label="Strategy" items={strategyNavItems} currentPath={pathname} badges={badges} />
                <NavSection sectionId="insights" label="Insights" items={insightNavItems} currentPath={pathname} badges={badges} />
                <NavSection sectionId="team" label="Team" items={teamNavItems} currentPath={pathname} badges={badges} />
                <NavSection sectionId="tools" label="Tools" items={toolsNavItems} currentPath={pathname} badges={badges} />
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
    sectionId: string;
    label: string;
    items: NavItem[];
    currentPath: string;
    badges?: SidebarBadges;
}

function NavSection({ sectionId, label, items, currentPath, badges }: NavSectionProps) {
    const { isCollapsed, toggleSection } = useSidebarStore();
    const collapsed = isCollapsed(sectionId);

    // Calculate if this section has any active items (for highlight when collapsed)
    const hasActiveItem = items.some(
        (item) => currentPath === item.href || currentPath.startsWith(`${item.href}/`)
    );

    // Calculate total badge count for collapsed section indicator
    const sectionBadgeCount = items.reduce((sum, item) => {
        if (item.badgeKey && badges?.[item.badgeKey]) {
            return sum + badges[item.badgeKey];
        }
        return sum;
    }, 0);

    return (
        <div>
            {/* Section Header - Clickable to toggle collapse */}
            <button
                onClick={() => toggleSection(sectionId)}
                className={cn(
                    'mb-1 flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left transition-colors',
                    'hover:bg-[var(--bg-tertiary)]',
                    hasActiveItem && collapsed && 'bg-[var(--accent-gold-light)]'
                )}
            >
                <span
                    className={cn(
                        'text-[11px] font-semibold uppercase tracking-wider',
                        hasActiveItem && collapsed
                            ? 'text-[var(--accent-gold)]'
                            : 'text-[var(--text-muted)]'
                    )}
                >
                    {label}
                </span>
                <div className="flex items-center gap-1.5">
                    {/* Show aggregated badge when collapsed */}
                    {collapsed && sectionBadgeCount > 0 && (
                        <BadgePill count={sectionBadgeCount} />
                    )}
                    <ChevronDown
                        className={cn(
                            'h-3.5 w-3.5 text-[var(--text-muted)] transition-transform duration-200',
                            collapsed && '-rotate-90'
                        )}
                    />
                </div>
            </button>

            {/* Animated collapsible content */}
            <div
                className={cn(
                    'grid transition-[grid-template-rows] duration-200 ease-out',
                    collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
                )}
            >
                <ul className="overflow-hidden space-y-1">
                    {items.map((item) => {
                        const isActive =
                            currentPath === item.href || currentPath.startsWith(`${item.href}/`);
                        const Icon = item.icon;
                        const badgeCount = item.badgeKey ? badges?.[item.badgeKey] : undefined;

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
                                    <span className="flex-1">{item.label}</span>
                                    {badgeCount !== undefined && badgeCount > 0 && (
                                        <BadgePill count={badgeCount} />
                                    )}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
}

/**
 * Notification badge pill component
 */
function BadgePill({ count }: { count: number }) {
    return (
        <span
            className={cn(
                'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5',
                'bg-[var(--accent-gold)] text-[10px] font-semibold text-white',
                'animate-in fade-in-0 zoom-in-75 duration-200'
            )}
        >
            {count > 99 ? '99+' : count}
        </span>
    );
}
