'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';

interface OrganizationSettingsProps {
    organization: {
        id: string;
        name: string;
        aiDraftsEnabled?: boolean;
    };
}

export function OrganizationSettings({ organization }: OrganizationSettingsProps) {
    const [isSaving, setIsSaving] = useState(false);

    const initials = organization.name
        ? organization.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : 'O';

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const response = await fetch(`/api/organizations/${organization.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });

            if (!response.ok) throw new Error('Failed to save settings');
            toast('success', 'Settings saved', 'Your organization settings have been updated.');
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
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gradient text-xl font-bold text-white">
                        {initials}
                    </div>
                    <div>
                        <Button variant="secondary" className="mb-1">Change Logo</Button>
                        <p className="text-xs text-[var(--text-muted)]">Square image, min 200x200px</p>
                    </div>
                </div>

                {/* Name */}
                <div>
                    <label className="mb-2 block text-sm font-medium">Organization Name</label>
                    <Input
                        type="text"
                        defaultValue={organization.name}
                    />
                </div>

                {/* Timezone */}
                <div>
                    <label className="mb-2 block text-sm font-medium">Timezone</label>
                    <select className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-4 py-3 text-sm outline-none focus:border-[var(--accent-gold)]">
                        <option>Australia/Sydney (AEDT)</option>
                        <option>America/New_York (EST)</option>
                        <option>Europe/London (GMT)</option>
                    </select>
                </div>

            </div>

            <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
        </div>
    );
}
