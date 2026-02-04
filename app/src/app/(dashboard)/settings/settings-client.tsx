'use client';

/**
 * Settings Client Component
 * Tab-based navigation for settings sections
 * 
 * Why: Horizontal tabs provide better navigation UX than nested sidebars
 */

import { useState, useRef, useEffect } from 'react';
import {
    User, Briefcase, PaintBucket, Bell, Key,
    ShoppingBag, Globe, Bot, ChevronLeft, ChevronRight, Plug2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProfileSettings } from '@/components/settings/profile-settings';
import { WorkspaceSettings } from '@/components/settings/workspace-settings';
import { AppearanceSettings } from '@/components/settings/appearance-settings';
import { ConnectedAccounts } from '@/components/settings/connected-accounts';
import { NotificationSettings } from '@/components/settings/notification-settings';
import { OpenRouterSettings } from '@/components/settings/openrouter-settings';
import { ShoppingSettings } from '@/components/settings/shopping-settings';
import { PlatformCredentialsSettings } from '@/components/settings/platform-credentials-settings';
import { IntegrationSettings } from '@/components/settings/integration-settings';

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
    };
}

export function SettingsClient({ user, organization }: SettingsClientProps) {
    const [activeTab, setActiveTab] = useState('profile');
    const tabsRef = useRef<HTMLDivElement>(null);
    const [showLeftScroll, setShowLeftScroll] = useState(false);
    const [showRightScroll, setShowRightScroll] = useState(false);

    const tabs = [
        { id: 'profile', label: 'Profile', icon: User },
        { id: 'organization', label: 'Workspace', icon: Briefcase },
        { id: 'appearance', label: 'Appearance', icon: PaintBucket },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'accounts', label: 'Connected Accounts', icon: Globe },
        { id: 'credentials', label: 'Platform Credentials', icon: Key },
        { id: 'integrations', label: 'API Integrations', icon: Plug2 },
        { id: 'ai', label: 'AI Settings', icon: Bot },
        { id: 'shopping', label: 'Shopping', icon: ShoppingBag },
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
                return <WorkspaceSettings organization={organization} />;
            case 'appearance':
                return <AppearanceSettings />;
            case 'notifications':
                return <NotificationSettings />;
            case 'accounts':
                return <ConnectedAccounts />;
            case 'credentials':
                return <PlatformCredentialsSettings />;
            case 'integrations':
                return <IntegrationSettings />;
            case 'ai':
                return <OpenRouterSettings />;
            case 'shopping':
                return <ShoppingSettings />;
            default:
                return <ProfileSettings user={user} />;
        }
    }

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

