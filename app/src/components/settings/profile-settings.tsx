'use client';

/**
 * Profile Settings
 * Why: Thin layout component — each card is in its own file for maintainability.
 */

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, Bell, Loader2, X } from 'lucide-react';
import { NotificationPrompt } from '@/components/pwa/notification-prompt';
import { NotificationPreferencesSection } from '@/components/settings/notification-preferences';
import { PushSubscriptionCard } from '@/components/settings/push-subscription-card';
import { TwoFactorAuthCard } from '@/components/settings/two-factor-auth-card';
import { ActiveSessionsCard } from '@/components/settings/active-sessions-card';
import { DeleteAccountCard } from '@/components/settings/delete-account-card';
import { toast } from '@/components/ui/toast';

interface ProfileSettingsProps {
    user: {
        id: string;
        name: string;
        email: string;
        image: string | null;
    };
}

export function ProfileSettings({ user }: ProfileSettingsProps) {
    const [avatarUrl, setAvatarUrl] = useState<string | null>(user.image);
    const [isUploading, setIsUploading] = useState(false);
    const [fullName, setFullName] = useState(user.name);
    const [isSavingName, setIsSavingName] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const initials = user.name
        ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : 'U';

    const handleAvatarClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Reset input so re-selecting the same file triggers change
        e.target.value = '';

        // Client-side validation
        if (file.size > 5 * 1024 * 1024) {
            toast('error', 'File too large', 'Please choose an image under 5 MB.');
            return;
        }

        if (!file.type.startsWith('image/')) {
            toast('error', 'Invalid file type', 'Please choose a JPG, PNG, or GIF image.');
            return;
        }

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/user/avatar', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Upload failed');
            }

            const { url } = await response.json();
            setAvatarUrl(url);
            toast('success', 'Avatar updated', 'Your profile picture has been changed.');
        } catch (error) {
            toast('error', 'Upload failed', error instanceof Error ? error.message : 'Please try again.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleRemoveAvatar = async () => {
        setIsUploading(true);
        try {
            const response = await fetch('/api/user/avatar', { method: 'DELETE' });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to remove avatar');
            }
            setAvatarUrl(null);
            toast('success', 'Avatar removed', 'Your profile picture has been removed.');
        } catch (error) {
            toast('error', 'Remove failed', error instanceof Error ? error.message : 'Please try again.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleSaveName = useCallback(async () => {
        if (!fullName.trim() || fullName === user.name) return;
        setIsSavingName(true);
        try {
            const response = await fetch('/api/user/name', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: fullName.trim() }),
            });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to save name');
            }
            toast('success', 'Profile updated', 'Your name has been changed.');
        } catch (error) {
            toast('error', 'Save failed', error instanceof Error ? error.message : 'Please try again.');
        } finally {
            setIsSavingName(false);
        }
    }, [fullName, user.name]);

    return (
        <div className="space-y-8">
            {/* Profile Section */}
            <div>
                <h2 className="text-lg sm:text-xl font-semibold mb-4 sm:mb-6">Profile</h2>

                <div className="card p-4 sm:p-6 space-y-5 sm:space-y-6">
                    {/* Avatar - stacks vertically on mobile */}
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        <div className="flex-shrink-0 relative group">
                            {avatarUrl ? (
                                <img src={avatarUrl} alt={user.name} className="h-20 w-20 rounded-full object-cover" />
                            ) : (
                                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient text-2xl font-bold text-white">
                                    {initials}
                                </div>
                            )}
                            {isUploading && (
                                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                                </div>
                            )}
                        </div>
                        <div className="w-full sm:w-auto text-center sm:text-left">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/gif,image/webp"
                                className="hidden"
                                onChange={handleFileChange}
                            />
                            <div className="flex flex-col sm:flex-row items-center gap-2">
                                <Button
                                    variant="secondary"
                                    className="w-full sm:w-auto"
                                    onClick={handleAvatarClick}
                                    disabled={isUploading}
                                >
                                    {isUploading ? 'Uploading...' : 'Change Avatar'}
                                </Button>
                                {avatarUrl && (
                                    <Button
                                        variant="secondary"
                                        className="w-full sm:w-auto"
                                        onClick={handleRemoveAvatar}
                                        disabled={isUploading}
                                    >
                                        <X className="h-4 w-4 mr-1" />
                                        Remove
                                    </Button>
                                )}
                            </div>
                            <p className="text-xs text-[var(--text-muted)] mt-1">JPG, PNG, or GIF. Max 5MB.</p>
                        </div>
                    </div>

                    {/* Name */}
                    <div>
                        <label className="mb-2 block text-sm font-medium">Full Name</label>
                        <Input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            maxLength={100}
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
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                            <a href="/contact" className="underline hover:text-[var(--text-primary)] transition-colors">Contact support</a> to change email
                        </p>
                    </div>

                    <Button
                        className="w-full sm:w-auto"
                        onClick={handleSaveName}
                        disabled={!fullName.trim() || fullName === user.name || isSavingName || isUploading}
                        isLoading={isSavingName}
                    >
                        Save Changes
                    </Button>
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
