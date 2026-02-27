'use client';

/**
 * Settings Client Component
 * Tab-based navigation for settings sections
 * 
 * Why: Horizontal tabs for desktop, vertical drill-down menu for mobile
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    User, Briefcase, PaintBucket, Bell,
    ShoppingBag, Globe, ChevronLeft, ChevronRight, Sparkles, CreditCard
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { ProfileSettings } from '@/components/settings/profile-settings';
import { OrganizationSettings } from '@/components/settings/organization-settings';
import { AppearanceSettings } from '@/components/settings/appearance-settings';
import { ConnectedAccounts } from '@/components/settings/connected-accounts';
import { NotificationSettings } from '@/components/settings/notification-settings';
import { ShoppingSettings } from '@/components/settings/shopping-settings';
import { BrandToneSettings } from '@/components/settings/brand-tone-settings';
import { BillingSettings } from '@/components/billing/billing-settings';

interface SettingsClientProps {
    user: {
        id: string;
        name: string;
        email: string;
        image: string | null;
    };
    organization: {
        id: string;
        name: string;
        slug: string;
        logo: string | null;
        timezone: string;
        aiDraftsEnabled?: boolean;
    };
}

interface TabConfig {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
}

export function SettingsClient({ user, organization }: SettingsClientProps) {
    const isMobile = useIsMobile();
    const searchParams = useSearchParams();

    /** Valid tab IDs to guard against arbitrary query values */
    const validTabIds = useMemo(() => new Set(['profile', 'organization', 'appearance', 'notifications', 'accounts', 'shopping', 'brand-tone', 'billing']), []);

    // Derive initial tab from ?tab= query param (e.g. after OAuth redirect)
    const initialTab = useMemo(() => {
        const tabParam = searchParams.get('tab');
        if (tabParam && validTabIds.has(tabParam)) return tabParam;
        return isMobile ? null : 'profile';
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const [activeTab, setActiveTab] = useState<string | null>(initialTab);
    const tabsRef = useRef<HTMLDivElement>(null);
    const [showLeftScroll, setShowLeftScroll] = useState(false);
    const [showRightScroll, setShowRightScroll] = useState(false);

    // Sync activeTab when switching between mobile/desktop
    useEffect(() => {
        if (!isMobile && activeTab === null) {
            setActiveTab('profile');
        }
    }, [isMobile, activeTab]);

    // Note: Platform Credentials, AI Settings, and Integrations are now managed
    // by super admins in the admin panel (/admin/platform-credentials, etc.)
    const tabs: TabConfig[] = [
        { id: 'profile', label: 'Profile', icon: User },
        { id: 'organization', label: 'Organization', icon: Briefcase },
        { id: 'appearance', label: 'Appearance', icon: PaintBucket },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'accounts', label: 'Connected Accounts', icon: Globe },
        { id: 'shopping', label: 'Shopping', icon: ShoppingBag },
        { id: 'brand-tone', label: 'Brand Tone', icon: Sparkles },
        { id: 'billing', label: 'Billing', icon: CreditCard },
    ];

    /**
     * Check scroll position to show/hide scroll indicators
     */
    const checkScroll = () => {
        if (tabsRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = tabsRef.current;
            setShowLeftScroll(scrollLeft > 0);
            setShowRightScroll(scrollLeft + clientWidth < scrollWidth - 1);
        }
    };

    useEffect(() => {
        checkScroll();
        const tabsElement = tabsRef.current;
        if (tabsElement) {
            tabsElement.addEventListener('scroll', checkScroll);
            window.addEventListener('resize', checkScroll);
        }
        return () => {
            if (tabsElement) {
                tabsElement.removeEventListener('scroll', checkScroll);
            }
            window.removeEventListener('resize', checkScroll);
        };
    }, []);

    const scrollTabs = (direction: 'left' | 'right') => {
        if (tabsRef.current) {
            const scrollAmount = 200;
            tabsRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth',
            });
        }
    };

    function renderContent() {
        switch (activeTab) {
            case 'profile':
                return <ProfileSettings user={user} />;
            case 'organization':
                return <OrganizationSettings organization={organization} />;
            case 'appearance':
                return <AppearanceSettings />;
            case 'notifications':
                return <NotificationSettings />;
            case 'accounts':
                return <ConnectedAccounts />;
            case 'shopping':
                return <ShoppingSettings />;
            case 'brand-tone':
                return <BrandToneSettings />;
            case 'billing':
                return <BillingSettings />;
            default:
                return <ProfileSettings user={user} />;
        }
    }

    // ========================================================================
    // MOBILE LAYOUT - Drill-down menu pattern
    // ========================================================================
    if (isMobile) {
        const activeTabConfig = tabs.find(t => t.id === activeTab);

        return (
            <div className="flex flex-col min-h-[100dvh] bg-[var(--bg-primary)]">
                {/* Header with glassmorphism */}
                <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg-secondary)]/95 backdrop-blur-lg pt-[env(safe-area-inset-top,16px)]">
                    <div className="flex items-center gap-3 px-4 py-3">
                        {activeTab !== null && (
                            <button
                                onClick={() => setActiveTab(null)}
                                className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[var(--bg-tertiary)] -ml-2"
                                aria-label="Back to settings menu"
                            >
                                <ChevronLeft className="h-5 w-5" />
                            </button>
                        )}
                        <h1 className="text-lg font-semibold">
                            {activeTab === null ? 'Settings' : activeTabConfig?.label || 'Settings'}
                        </h1>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom,16px)]">
                    {activeTab === null ? (
                        // Settings Menu
                        <div className="p-4 space-y-2">
                            {tabs.map((tab) => {
                                const Icon = tab.icon;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className="flex w-full items-center gap-4 rounded-xl bg-[var(--bg-secondary)] p-4 text-left transition-colors hover:bg-[var(--bg-tertiary)] active:scale-[0.98]"
                                    >
                                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
                                            <Icon className="h-5 w-5 text-[var(--text-muted)]" />
                                        </div>
                                        <span className="flex-1 font-medium">{tab.label}</span>
                                        <ChevronRight className="h-5 w-5 text-[var(--text-muted)]" />
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        // Settings Content
                        <div className="p-4">
                            {renderContent()}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ========================================================================
    // DESKTOP LAYOUT - Horizontal tabs
    // ========================================================================
    return (
        <div className="flex h-[calc(100vh-4rem)] flex-col">
            {/* Header with Tabs */}
            <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg-primary)]">
                <div className="mx-auto max-w-7xl px-4 pt-6">
                    <h1 className="mb-4 text-2xl font-bold">Settings</h1>

                    {/* Tab Navigation */}
                    <div className="relative flex items-center">
                        {/* Left scroll button */}
                        {showLeftScroll && (
                            <button
                                onClick={() => scrollTabs('left')}
                                className="absolute left-0 z-10 flex h-10 w-8 items-center justify-center bg-gradient-to-r from-[var(--bg-primary)] to-transparent"
                                aria-label="Scroll left"
                            >
                                <ChevronLeft className="h-5 w-5 text-[var(--text-muted)]" />
                            </button>
                        )}

                        {/* Scrollable tabs container */}
                        <div
                            ref={tabsRef}
                            className="flex gap-1 overflow-x-auto scrollbar-hide"
                            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                        >
                            {tabs.map((tab) => {
                                const Icon = tab.icon;
                                const isActive = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={cn(
                                            'flex flex-shrink-0 items-center gap-2 rounded-t-lg px-4 py-3 text-sm font-medium transition-colors',
                                            isActive
                                                ? 'border-b-2 border-[var(--accent-gold)] bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                                                : 'text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                                        )}
                                    >
                                        <Icon className="h-4 w-4" />
                                        <span className="whitespace-nowrap">{tab.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Right scroll button */}
                        {showRightScroll && (
                            <button
                                onClick={() => scrollTabs('right')}
                                className="absolute right-0 z-10 flex h-10 w-8 items-center justify-center bg-gradient-to-l from-[var(--bg-primary)] to-transparent"
                                aria-label="Scroll right"
                            >
                                <ChevronRight className="h-5 w-5 text-[var(--text-muted)]" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto bg-[var(--bg-primary)]">
                <div className="mx-auto max-w-5xl p-6">
                    {renderContent()}
                </div>
            </main>
        </div>
    );
}

