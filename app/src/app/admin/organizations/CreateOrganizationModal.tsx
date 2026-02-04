'use client';

/**
 * Create Organization Modal
 * Why: Allows super admin to create new organizations
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { TIERS } from './types';

interface CreateOrganizationModalProps {
    onClose: () => void;
    onCreated: () => void;
}

export function CreateOrganizationModal({
    onClose,
    onCreated,
}: CreateOrganizationModalProps) {
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [tier, setTier] = useState<typeof TIERS[number]>('FREE');
    const [maxWorkspaces, setMaxWorkspaces] = useState(1);
    const [maxMembers, setMaxMembers] = useState(5);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError('');

        try {
            const res = await fetch('/api/admin/organizations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, slug, tier, maxWorkspaces, maxMembers }),
            });

            if (res.ok) {
                onCreated();
            } else {
                const data = await res.json();
                setError(data.message || 'Failed to create organization');
            }
        } catch {
            setError('Failed to create organization');
        } finally {
            setSaving(false);
        }
    };

    /**
     * Auto-generate slug from name
     */
    const handleNameChange = (value: string) => {
        setName(value);
        setSlug(value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold text-white">Create Organization</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {error && (
                    <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1.5">Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => handleNameChange(e.target.value)}
                            required
                            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-white focus:border-purple-500 focus:outline-none"
                            placeholder="Acme Corp"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1.5">Slug</label>
                        <input
                            type="text"
                            value={slug}
                            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                            required
                            pattern="^[a-z0-9-]+$"
                            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-white focus:border-purple-500 focus:outline-none"
                            placeholder="acme-corp"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1.5">Tier</label>
                        <select
                            value={tier}
                            onChange={(e) => setTier(e.target.value as typeof TIERS[number])}
                            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-white focus:border-purple-500 focus:outline-none"
                        >
                            {TIERS.map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1.5">Max Workspaces</label>
                            <input
                                type="number"
                                value={maxWorkspaces}
                                onChange={(e) => setMaxWorkspaces(Number(e.target.value))}
                                min={1}
                                max={100}
                                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-white focus:border-purple-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1.5">Max Members</label>
                            <input
                                type="number"
                                value={maxMembers}
                                onChange={(e) => setMaxMembers(Number(e.target.value))}
                                min={1}
                                max={1000}
                                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-white focus:border-purple-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:bg-gray-800"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                        >
                            {saving ? 'Creating...' : 'Create Organization'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
