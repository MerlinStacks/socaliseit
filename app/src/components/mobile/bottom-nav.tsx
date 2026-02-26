/**
 * Mobile Bottom Navigation
 * PWA-style navigation for mobile devices with haptic feedback
 */

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Home, Calendar, Image as ImageIcon, MessageSquare, User, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/hooks/use-haptic';
import { LongPressFAB } from './long-press-fab';
import { MobileOrganizationSwitcher } from './mobile-org-switcher';
import type { SidebarBadges } from '@/app/api/sidebar/badges/route';

interface NavItem {
    label: string;
    href: string;
    icon: React.ElementType;
    /** Key to match against badge data */
    badgeKey?: keyof SidebarBadges;
}

const navItems: NavItem[] = [
    { label: 'Home', href: '/dashboard', icon: Home },
    { label: 'Calendar', href: '/calendar', icon: Calendar },
    { label: 'Media', href: '/media', icon: ImageIcon },
    { label: 'Inbox', href: '/engagement', icon: MessageSquare, badgeKey: 'engagement' },
    { label: 'Profile', href: '/settings', icon: User },
];

export function MobileBottomNav() {
    const pathname = usePathname();
    const router = useRouter();

    // Fetch badge counts (same API as sidebar)
    const { data: badges } = useQuery<SidebarBadges>({
        queryKey: ['sidebar-badges'],
        queryFn: async () => {
            const res = await fetch('/api/sidebar/badges');
            if (!res.ok) throw new Error('Failed to fetch badges');
            return res.json();
        },
        refetchInterval: 60_000,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: false,
        staleTime: 2 * 60_000, // 2 min — badge counts change infrequently
    });

    /**
     * Handle navigation with haptic feedback
     * Why: Provides tactile confirmation of navigation action.
     * Non-create items use <Link> for auto-prefetch; this handler
     * only triggers haptics without preventing default navigation.
     */
    const handleNavClick = () => {
        triggerHaptic('light');
    };

    return (
        <nav
            className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-[var(--bg-secondary)]/95 backdrop-blur-lg md:hidden"
            style={{
                paddingBottom: 'max(env(safe-area-inset-bottom, 8px), 8px)',
            }}
        >
            {/* Organization switcher — only visible when user has multiple orgs */}
            <MobileOrganizationSwitcher />
            <div className="flex items-center justify-around">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    const badgeCount = item.badgeKey ? badges?.[item.badgeKey] : undefined;

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={handleNavClick}
                            prefetch={true}
                            className={cn(
                                'flex flex-1 flex-col items-center gap-1 py-3 transition-transform active:scale-95 relative'
                            )}
                        >
                            <div className="relative">
                                <Icon
                                    className={cn(
                                        'h-5 w-5 transition-colors',
                                        isActive
                                            ? 'text-[var(--accent-gold)]'
                                            : 'text-[var(--text-muted)]'
                                    )}
                                />
                                {/* Badge indicator */}
                                {badgeCount !== undefined && badgeCount > 0 && (
                                    <span className="absolute -top-1 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent-gold)] px-1 text-[10px] font-semibold text-white">
                                        {badgeCount > 99 ? '99+' : badgeCount}
                                    </span>
                                )}
                            </div>
                            <span
                                className={cn(
                                    'text-[10px] font-medium',
                                    isActive
                                        ? 'text-[var(--accent-gold)]'
                                        : 'text-[var(--text-muted)]'
                                )}
                            >
                                {item.label}
                            </span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}

/**
 * Spacer component to prevent content from being hidden behind bottom nav
 * Why: Content needs padding to account for fixed bottom nav height + safe area
 */
export function MobileBottomNavSpacer() {
    return (
        <div
            className="md:hidden"
            style={{
                height: 'calc(72px + max(env(safe-area-inset-bottom, 8px), 8px))',
            }}
        />
    );
}


/**
 * Mobile Header
 */
interface MobileHeaderProps {
    title: string;
    showBack?: boolean;
    onBack?: () => void;
    actions?: React.ReactNode;
}

export function MobileHeader({ title, showBack, onBack, actions }: MobileHeaderProps) {
    return (
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 md:hidden">
            <div className="flex items-center gap-3">
                {showBack && (
                    <button
                        onClick={onBack}
                        className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]"
                    >
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                )}
                <h1 className="text-lg font-semibold">{title}</h1>
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
    );
}

/**
 * Quick Capture FAB (for mobile)
 */
interface QuickCaptureFABProps {
    onClick: () => void;
}

export function QuickCaptureFAB({ onClick }: QuickCaptureFABProps) {
    return (
        <button
            onClick={onClick}
            className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient shadow-lg md:hidden"
        >
            <Plus className="h-6 w-6 text-white" />
        </button>
    );
}

/**
 * Swipeable Card wrapper for mobile
 */
interface SwipeableCardProps {
    children: React.ReactNode;
    leftAction?: { label: string; color: string };
    rightAction?: { label: string; color: string };
}

export function SwipeableCard({
    children,
    leftAction,
    rightAction,
}: SwipeableCardProps) {
    // In production, would use react-swipeable or framer-motion
    return (
        <div className="relative overflow-hidden">
            {/* Left action background */}
            {leftAction && (
                <div className="absolute inset-y-0 left-0 flex w-20 items-center justify-center bg-[var(--error)] text-white">
                    {leftAction.label}
                </div>
            )}

            {/* Right action background */}
            {rightAction && (
                <div className="absolute inset-y-0 right-0 flex w-20 items-center justify-center bg-[var(--success)] text-white">
                    {rightAction.label}
                </div>
            )}

            {/* Content */}
            <div className="relative bg-[var(--bg-secondary)]">{children}</div>
        </div>
    );
}
