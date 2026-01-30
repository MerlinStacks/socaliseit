/**
 * Mobile Bottom Navigation
 * PWA-style navigation for mobile devices
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Calendar, Plus, BarChart3, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
    label: string;
    href: string;
    icon: React.ElementType;
}

const navItems: NavItem[] = [
    { label: 'Home', href: '/dashboard', icon: Home },
    { label: 'Calendar', href: '/calendar', icon: Calendar },
    { label: 'Create', href: '/compose', icon: Plus },
    { label: 'Analytics', href: '/analytics', icon: BarChart3 },
    { label: 'Profile', href: '/settings', icon: User },
];

export function MobileBottomNav() {
    const pathname = usePathname();

    return (
        <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-[var(--bg-secondary)] pb-safe md:hidden">
            <div className="flex items-center justify-around">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    const isCreate = item.label === 'Create';

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                'flex flex-1 flex-col items-center gap-1 py-3',
                                isCreate && 'relative'
                            )}
                        >
                            {isCreate ? (
                                <div className="absolute -top-5 flex h-14 w-14 items-center justify-center rounded-full bg-gradient shadow-lg">
                                    <Icon className="h-6 w-6 text-white" />
                                </div>
                            ) : (
                                <Icon
                                    className={cn(
                                        'h-5 w-5 transition-colors',
                                        isActive
                                            ? 'text-[var(--accent-gold)]'
                                            : 'text-[var(--text-muted)]'
                                    )}
                                />
                            )}
                            <span
                                className={cn(
                                    'text-[10px] font-medium',
                                    isActive
                                        ? 'text-[var(--accent-gold)]'
                                        : 'text-[var(--text-muted)]',
                                    isCreate && 'mt-5'
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
    onSwipeLeft?: () => void;
    onSwipeRight?: () => void;
    leftAction?: { label: string; color: string };
    rightAction?: { label: string; color: string };
}

export function SwipeableCard({
    children,
    onSwipeLeft,
    onSwipeRight,
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
