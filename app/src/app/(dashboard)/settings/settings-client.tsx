'use client';

import { useState } from 'react';
import {
    User, Briefcase, PaintBucket, Bell, Key,
    ShoppingBag, Globe, Menu, X, LogOut, Bot
} from 'lucide-react';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { ProfileSettings } from '@/components/settings/profile-settings';
import { WorkspaceSettings } from '@/components/settings/workspace-settings';
import { AppearanceSettings } from '@/components/settings/appearance-settings';
import { ConnectedAccounts } from '@/components/settings/connected-accounts';
import { NotificationSettings } from '@/components/settings/notification-settings';
import { OpenRouterSettings } from '@/components/settings/openrouter-settings';
import { ShoppingSettings } from '@/components/settings/shopping-settings';
import { PlatformCredentialsSettings } from '@/components/settings/platform-credentials-settings';

interface SettingsClientProps {
    user: any;
    workspace: any;
}

export function SettingsClient({ user, workspace }: SettingsClientProps) {
    const [activeTab, setActiveTab] = useState('profile');
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const tabs = [
        { id: 'profile', label: 'Profile', icon: User },
        { id: 'workspace', label: 'Workspace', icon: Briefcase },
        { id: 'appearance', label: 'Appearance', icon: PaintBucket },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'accounts', label: 'Connected Accounts', icon: Globe },
        { id: 'integrations', label: 'Platform Integrations', icon: Key },
        { id: 'ai', label: 'AI Settings', icon: Bot },
        { id: 'shopping', label: 'Shopping', icon: ShoppingBag },
    ];

    function renderContent() {
        switch (activeTab) {
            case 'profile':
                return <ProfileSettings user={user} />;
            case 'workspace':
                return <WorkspaceSettings workspace={workspace} />;
            case 'appearance':
                return <AppearanceSettings />;
            case 'notifications':
                return <NotificationSettings />;
            case 'accounts':
                return <ConnectedAccounts />;
            case 'integrations':
                return <PlatformCredentialsSettings />;
            case 'ai':
                return <OpenRouterSettings />;
            case 'shopping':
                return <ShoppingSettings />;
            default:
                return <ProfileSettings user={user} />;
        }
    }

    return (
        <div className="flex h-[calc(100vh-4rem)]">
            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
                    fixed bottom-0 left-0 top-16 z-50 w-64 transform border-r border-[var(--border)] 
                    bg-[var(--bg-secondary)] pb-10 transition-transform duration-200 lg:static lg:block
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                `}
            >
                <div className="flex h-full flex-col">
                    <div className="p-4 lg:hidden">
                        <div className="flex items-center justify-between">
                            <h2 className="font-semibold">Settings</h2>
                            <button onClick={() => setSidebarOpen(false)}>
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    <nav className="flex-1 space-y-1 p-4">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => {
                                        setActiveTab(tab.id);
                                        setSidebarOpen(false);
                                    }}
                                    className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${activeTab === tab.id
                                        ? 'bg-[var(--accent-gold)] text-white'
                                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                                        }`}
                                >
                                    <Icon className="h-5 w-5" />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </nav>

                    <div className="border-t border-[var(--border)] p-4">
                        <Button
                            variant="secondary"
                            className="w-full justify-start gap-3"
                            onClick={() => signOut({ callbackUrl: '/login' })}
                        >
                            <LogOut className="h-4 w-4" />
                            Log Out
                        </Button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto bg-[var(--bg-primary)]">
                <div className="p-6 lg:p-10">
                    <div className="mb-6 flex items-center gap-4 lg:hidden">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                            <Menu className="h-6 w-6" />
                        </button>
                        <h1 className="text-2xl font-bold">Settings</h1>
                    </div>

                    <div className="mx-auto max-w-4xl">
                        {renderContent()}
                    </div>
                </div>
            </main>
        </div>
    );
}
