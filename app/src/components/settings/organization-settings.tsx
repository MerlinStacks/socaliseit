'use client';

import { useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { Upload } from 'lucide-react';

interface OrganizationSettingsProps {
    organization: {
        id: string;
        name: string;
        logo?: string | null;
        timezone?: string;
        aiDraftsEnabled?: boolean;
    };
}

const TIMEZONE_OPTIONS = [
    { value: 'Australia/Sydney', label: 'Australia/Sydney (AEDT)' },
    { value: 'America/New_York', label: 'America/New_York (EST)' },
    { value: 'America/Chicago', label: 'America/Chicago (CST)' },
    { value: 'America/Denver', label: 'America/Denver (MST)' },
    { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST)' },
    { value: 'Europe/London', label: 'Europe/London (GMT)' },
    { value: 'Europe/Paris', label: 'Europe/Paris (CET)' },
    { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
    { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT)' },
    { value: 'Pacific/Auckland', label: 'Pacific/Auckland (NZDT)' },
];

export function OrganizationSettings({ organization }: OrganizationSettingsProps) {
    const { update: updateSession } = useSession();
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const [name, setName] = useState(organization.name);
    const [timezone, setTimezone] = useState(organization.timezone || 'Australia/Sydney');
    const [logoUrl, setLogoUrl] = useState<string | null>(organization.logo || null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const initials = name
        ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : 'O';

    const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate: image only, max 5MB
        if (!file.type.startsWith('image/')) {
            toast('error', 'Invalid file', 'Please select an image file.');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast('error', 'File too large', 'Logo must be under 5MB.');
            return;
        }

        setIsUploadingLogo(true);
        try {
            const formData = new FormData();
            formData.append('file', file);

            const uploadRes = await fetch('/api/media', { method: 'POST', body: formData });
            if (!uploadRes.ok) {
                const err = await uploadRes.json().catch(() => ({}));
                throw new Error(err.error || 'Upload failed');
            }

            const uploaded = await uploadRes.json();
            setLogoUrl(uploaded.url);
            toast('success', 'Logo uploaded', 'Click "Save Changes" to apply.');
        } catch (error) {
            toast('error', 'Upload failed', error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setIsUploadingLogo(false);
            // Reset input so re-selecting the same file triggers onChange
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleSave = async () => {
        if (!name.trim()) {
            toast('error', 'Validation error', 'Organization name cannot be empty.');
            return;
        }

        setIsSaving(true);
        try {
            const response = await fetch(`/api/organizations/${organization.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    timezone,
                    logo: logoUrl,
                }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to save settings');
            }

            toast('success', 'Settings saved', 'Your organization settings have been updated.');

            // Refresh NextAuth session so sidebar/header picks up the new name/logo
            await updateSession();
            router.refresh();
        } catch (error) {
            toast('error', 'Save failed', error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div>
            <h2 className="text-xl font-semibold mb-6">Organization</h2>

            <div className="card p-6 space-y-6">
                {/* Logo */}
                <div className="flex items-center gap-4">
                    {logoUrl ? (
                        <img
                            src={logoUrl}
                            alt={`${name} logo`}
                            className="h-16 w-16 rounded-lg object-cover"
                        />
                    ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gradient text-xl font-bold text-white">
                            {initials}
                        </div>
                    )}
                    <div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            className="hidden"
                            onChange={handleLogoSelect}
                        />
                        <Button
                            variant="secondary"
                            className="mb-1"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploadingLogo}
                        >
                            {isUploadingLogo ? (
                                'Uploading...'
                            ) : (
                                <>
                                    <Upload className="h-4 w-4 mr-1.5" />
                                    Change Logo
                                </>
                            )}
                        </Button>
                        <p className="text-xs text-[var(--text-muted)]">Square image, min 200x200px</p>
                    </div>
                </div>

                {/* Name */}
                <div>
                    <label className="mb-2 block text-sm font-medium">Organization Name</label>
                    <Input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>

                {/* Timezone */}
                <div>
                    <label className="mb-2 block text-sm font-medium">Timezone</label>
                    <select
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-4 py-3 text-sm outline-none focus:border-[var(--accent-gold)]"
                    >
                        {TIMEZONE_OPTIONS.map((tz) => (
                            <option key={tz.value} value={tz.value}>{tz.label}</option>
                        ))}
                    </select>
                </div>

            </div>

            <Button onClick={handleSave} disabled={isSaving || isUploadingLogo} className="mt-4">
                {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
        </div>
    );
}
