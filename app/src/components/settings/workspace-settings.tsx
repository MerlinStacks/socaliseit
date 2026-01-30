'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface WorkspaceSettingsProps {
    workspace: {
        name: string;
    };
}

export function WorkspaceSettings({ workspace }: WorkspaceSettingsProps) {
    const initials = workspace.name
        ? workspace.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : 'W';

    return (
        <div>
            <h2 className="text-xl font-semibold mb-6">Workspace</h2>

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
                    <label className="mb-2 block text-sm font-medium">Workspace Name</label>
                    <Input
                        type="text"
                        defaultValue={workspace.name}
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

                <Button>Save Changes</Button>
            </div>
        </div>
    );
}
