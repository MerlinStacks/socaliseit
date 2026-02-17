'use client';

/**
 * Profile Settings
 * Why: Thin layout component — each card is in its own file for maintainability.
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, Bell } from 'lucide-react';
import { NotificationPrompt } from '@/components/pwa/notification-prompt';
import { NotificationPreferencesSection } from '@/components/settings/notification-preferences';
import { PushSubscriptionCard } from '@/components/settings/push-subscription-card';
import { TwoFactorAuthCard } from '@/components/settings/two-factor-auth-card';
import { ActiveSessionsCard } from '@/components/settings/active-sessions-card';
import { DeleteAccountCard } from '@/components/settings/delete-account-card';

interface ProfileSettingsProps {
    user: {
        name: string;
        email: string;
        image: string | null;
    };
}

export function ProfileSettings({ user }: ProfileSettingsProps) {
    const initials = user.name
        ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : 'U';

    return (
        <div className="space-y-8">
            {/* Profile Section */}
            <div>
                <h2 className="text-lg sm:text-xl font-semibold mb-4 sm:mb-6">Profile</h2>

                <div className="card p-4 sm:p-6 space-y-5 sm:space-y-6">
                    {/* Avatar - stacks vertically on mobile */}
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        <div className="flex-shrink-0">
                            {user.image ? (
                                <img src={user.image} alt={user.name} className="h-20 w-20 rounded-full object-cover" />
                            ) : (
                                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient text-2xl font-bold text-white">
                                    {initials}
                                </div>
                            )}
                        </div>
                        <div className="w-full sm:w-auto text-center sm:text-left">
                            <Button variant="secondary" className="w-full sm:w-auto mb-1">Change Avatar</Button>
                            <p className="text-xs text-[var(--text-muted)]">JPG, PNG, or GIF. Max 5MB.</p>
                        </div>
                    </div>

                    {/* Name */}
                    <div>
                        <label className="mb-2 block text-sm font-medium">Full Name</label>
                        <Input
                            type="text"
                            defaultValue={user.name}
                        />
                    </div>

                    {/* Email */}
                    <div>
                        <label className="mb-2 block text-sm font-medium">Email</label>
                        <Input
                            type="email"
                            defaultValue={user.email}
                            disabled
                            className="opacity-50"
                        />
                        <p className="mt-1 text-xs text-[var(--text-muted)]">Contact support to change email</p>
                    </div>

                    <Button className="w-full sm:w-auto">Save Changes</Button>
                </div>
            </div>

            {/* Notifications Section */}
            <div>
                <h2 className="text-lg sm:text-xl font-semibold mb-4 sm:mb-6 flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    Notifications
                </h2>

                <div className="space-y-4">
                    <NotificationPrompt className="mb-2" />
                    <PushSubscriptionCard />
                    <NotificationPreferencesSection />
                </div>
            </div>

            {/* Security Section */}
            <div>
                <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Security
                </h2>

                <div className="space-y-4">
                    <TwoFactorAuthCard />
                    <ActiveSessionsCard />
                    <DeleteAccountCard />
                </div>
            </div>
        </div>
    );
}
