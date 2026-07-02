'use client';

import { useState, useEffect } from 'react';

/**
 * Main application sidebar with navigation
 * Features:
 * - Auto-collapse: collapsed by default, expands on hover
 * - Flat navigation without section headers
 * - Compact spacing to minimize scrolling
 * - Glassmorphism styling
 * - SPA-mode navigation: clicks swap views client-side (instant)
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ACCOUNTS_QUERY_KEY, accountsQueryFn, ACCOUNTS_STALE_TIME } from '@/hooks/use-compose-data';
import { buildCalendarQueryKey, calendarPrefetchFn, CALENDAR_STALE_TIME } from '@/hooks/use-calendar-data';
import { signOut } from 'next-auth/react';
import { useOrganization } from '@/hooks/use-organization';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/lib/stores/sidebar-store';
import { clearAppBadge } from '@/hooks/use-app-badge';
import { useSPANavigation } from '@/components/layout/dashboard-spa-shell';
import {
    Home,
    Calendar,
    Edit3 as Compose,
    Image,
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
    Moon,
    Sun,
    Bot,
} from 'lucide-react';
import type { SidebarBadges } from '@/app/api/sidebar/badges/route';
import { OrganizationSwitcher } from './organization-switcher';
import { NotificationBell, NotificationCenter } from '@/components/ui/notification-center';
import { throwApiResponseError } from '@/lib/api-error';

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
    { label: 'Pillars', href: '/pillars', icon: LayoutGrid },
    { label: 'Trends', href: '/trends', icon: TrendingUp },
    { label: 'Seb', href: '/seb', icon: Bot },
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
            if (!res.ok) throwApiResponseError(res, 'Failed to fetch badges');
            return res.json();
        },
        refetchInterval: 120_000, // 2 min — badge counts change infrequently
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: false,
        staleTime: 5 * 60_000, // 5 min — engagement page invalidates on read
    });
}

export function Sidebar({ user }: SidebarProps) {
    const pathname = usePathname();
    const { navigateTo, currentPath } = useSPANavigation();
    const queryClient = useQueryClient();
    const { organization } = useOrganization();
    const { data: badges, isLoading: badgesLoading } = useSidebarBadges();
    const { isExpanded, setExpanded } = useSidebarStore();

    const canRunHeavyPrefetch =
        typeof navigator === 'undefined'
            ? false
            : !((navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection?.saveData) &&
            (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection?.effectiveType !== '2g';

    /**
     * Why: Pre-warm data caches for the most-visited pages so SPA view
     * swaps feel instant. Route bundles are now lazy-loaded by the SPA
     * shell on first visit — no manual router.prefetch() needed.
     */
    useEffect(() => {
        // Accounts — used by compose + calendar
        queryClient.prefetchQuery({
            queryKey: ACCOUNTS_QUERY_KEY,
            queryFn: accountsQueryFn,
            staleTime: ACCOUNTS_STALE_TIME,
        });
        // Calendar posts + notes
        queryClient.prefetchQuery({
            queryKey: buildCalendarQueryKey(organization?.id),
            queryFn: calendarPrefetchFn,
            staleTime: CALENDAR_STALE_TIME,
        });
        // Media folders — used by compose media picker
        queryClient.prefetchQuery({
            queryKey: ['media-folders'],
            queryFn: async () => {
                const res = await fetch('/api/media/folders');
                if (!res.ok) return [];
                const data = await res.json();
                return data.folders || [];
            },
            staleTime: 2 * 60_000,
        });
        // Optimal posting times — used by compose scheduler
        queryClient.prefetchQuery({
            queryKey: ['optimal-times'],
            queryFn: async () => {
                const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                const res = await fetch(`/api/analytics/optimal-times?tz=${encodeURIComponent(tz)}`);
                if (!res.ok) return { suggestions: [], dataPoints: 0, confidence: 'low' as const };
                return res.json();
            },
            staleTime: 5 * 60_000,
        });
        // Account health — used by settings + health alerts
        queryClient.prefetchQuery({
            queryKey: ['account-health'],
            queryFn: async () => {
                const res = await fetch('/api/accounts/health');
                if (!res.ok) return { accounts: [], summary: { total: 0, healthy: 0, expiring: 0, expired: 0, error: 0 } };
                return res.json();
            },
            staleTime: 2 * 60_000,
        });
        // Hashtag collections — used by compose hashtag picker
        queryClient.prefetchQuery({
            queryKey: ['hashtag-collections'],
            queryFn: async () => {
                const res = await fetch('/api/hashtags/collections');
                if (!res.ok) return { collections: [], total: 0 };
                return res.json();
            },
            staleTime: 5 * 60_000,
        });
        // Preload heavier work only when the connection can handle it.
        if (canRunHeavyPrefetch && 'requestIdleCallback' in window) {
            // Phase 1: JS bundles for top pages
            requestIdleCallback(() => {
                import('@/app/(dashboard)/calendar/page');
                import('@/app/(dashboard)/engagement/page');
                import('@/app/(dashboard)/media/page');
            });

            // Phase 2: API data for top destinations only
            requestIdleCallback(() => {
                // Dashboard data — most visited page
                queryClient.prefetchQuery({
                    queryKey: ['dashboard-data'],
                    queryFn: async () => {
                        const res = await fetch('/api/dashboard/data');
                        if (!res.ok) return null;
                        return res.json();
                    },
                    staleTime: 2 * 60_000,
                });
            });
        }
    }, [canRunHeavyPrefetch, queryClient, organization?.id]);

    /**
     * Quick theme toggle — syncs with AppearanceSettings localStorage key
     * Why: Users need fast access to dark/light mode without navigating to Settings
     */
    const [isDark, setIsDark] = useState(false);
    useEffect(() => {
        const current = document.documentElement.getAttribute('data-theme');
        setIsDark(current === 'dark');
    }, []);

    const toggleTheme = () => {
        const next = !isDark;
        setIsDark(next);
        if (next) {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        // Sync with AppearanceSettings' localStorage key
        try {
            const saved = localStorage.getItem('socialiseit-appearance');
            const prefs = saved ? JSON.parse(saved) : {};
            prefs.darkMode = next;
            localStorage.setItem('socialiseit-appearance', JSON.stringify(prefs));
        } catch { /* Ignore storage errors */ }
    };

    const [isNotificationOpen, setIsNotificationOpen] = useState(false);

    return (
        <aside
            onMouseEnter={() => setExpanded(true)}
            onMouseLeave={() => setExpanded(false)}
            onFocusCapture={() => setExpanded(true)}
            onBlurCapture={(event) => {
                const nextTarget = event.relatedTarget as Node | null;
                if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
                    setExpanded(false);
                }
            }}
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
                        /**
                         * Why currentPath: the SPA shell tracks the active view in
                         * React state. We fall back to Next.js pathname for SSR routes
                         * or when the SPA shell hasn't taken over yet.
                         */
                        const isActive =
                            currentPath === item.href ||
                            pathname === item.href ||
                            pathname.startsWith(`${item.href}/`);
                        const Icon = item.icon;
                        const badgeCount = item.badgeKey ? badges?.[item.badgeKey] : undefined;

                        return (
                            <li key={item.href}>
                                <button
                                    type="button"
                                    onClick={() => navigateTo(item.href)}
                                    aria-current={isActive ? 'page' : undefined}
                                    title={!isExpanded ? item.label : undefined}
                                    className={cn(
                                        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-left',
                                        isActive
                                            ? 'bg-[var(--accent-gold-light)] text-[var(--accent-gold)]'
                                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                                    )}
                                >
                                    <Icon className="h-5 w-5 shrink-0" />
                                    {isExpanded && (
                                        <>
                                            <span className="flex-1 truncate">{item.label}</span>
                                            {item.badgeKey && badgesLoading ? (
                                                <span className="skeleton h-4 w-6 rounded-full" />
                                            ) : badgeCount !== undefined && badgeCount > 0 ? (
                                                <BadgePill count={badgeCount} />
                                            ) : null}
                                        </>
                                    )}
                                    {!isExpanded && badgeCount !== undefined && badgeCount > 0 && (
                                        <span className="absolute right-1 top-0.5 h-2 w-2 rounded-full bg-[var(--accent-gold)]" />
                                    )}
                                </button>
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
                            <NotificationBell onClick={() => setIsNotificationOpen(true)} />
                            <button
                                type="button"
                                onClick={toggleTheme}
                                className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                            >
                                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    // Clear app icon badge before signing out
                                    await clearAppBadge();
                                    signOut({ callbackUrl: '/login' });
                                }}
                                className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--error)]"
                                title="Sign out"
                                aria-label="Sign out"
                            >
                                <LogOut className="h-4 w-4" />
                            </button>
                        </>
                    )}
                </div>
            </div>

            <NotificationCenter
                isOpen={isNotificationOpen}
                onClose={() => setIsNotificationOpen(false)}
            />
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
                'flex h-4 min-w-4 items-center justify-center rounded-full px-1.5',
                'bg-[var(--accent-gold)] text-[10px] font-semibold text-white'
            )}
        >
            {count}
        </span>
    );
}
