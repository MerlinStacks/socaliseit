'use client';

/**
 * Device Registry Section
 * Manage organization-level named devices for push notification targeting.
 *
 * Why: Allows admins to label and manage devices so manual publish
 * reminders can be sent to specific devices rather than broadcast.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Smartphone, Plus, Pencil, Trash2, Check, X,
    Loader2, AlertCircle, Unlink,
} from 'lucide-react';

interface NotificationDeviceData {
    id: string;
    label: string;
    pushSubscriptionId: string | null;
    createdAt: string;
    updatedAt: string;
    pushSubscription: {
        id: string;
        userAgent: string | null;
        createdAt: string;
        user: { name: string | null; email: string };
    } | null;
}

const DEVICES_QUERY_KEY = ['notification-devices'] as const;

/** Fetches all registered devices for the current org */
async function fetchDevices(): Promise<NotificationDeviceData[]> {
    const res = await fetch('/api/settings/notification-devices');
    if (!res.ok) throw new Error('Failed to fetch devices');
    const data = await res.json();
    return data.devices;
}

/**
 * Renders the registered devices list with inline editing capabilities.
 * Admin-only: add, rename, and delete devices.
 */
export function DeviceRegistry() {
    const queryClient = useQueryClient();
    const [newLabel, setNewLabel] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editLabel, setEditLabel] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);

    const { data: devices = [], isLoading, error } = useQuery({
        queryKey: DEVICES_QUERY_KEY,
        queryFn: fetchDevices,
        staleTime: 5 * 60_000, // 5 min — device list rarely changes outside explicit mutations
    });

    const createMutation = useMutation({
        mutationFn: async (label: string) => {
            const res = await fetch('/api/settings/notification-devices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to create device');
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: DEVICES_QUERY_KEY });
            setNewLabel('');
            setShowAddForm(false);
        },
    });

    const renameMutation = useMutation({
        mutationFn: async ({ id, label }: { id: string; label: string }) => {
            const res = await fetch(`/api/settings/notification-devices/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to rename device');
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: DEVICES_QUERY_KEY });
            setEditingId(null);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/settings/notification-devices/${id}`, {
                method: 'DELETE',
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to delete device');
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: DEVICES_QUERY_KEY });
        },
    });

    function handleStartEdit(device: NotificationDeviceData) {
        setEditingId(device.id);
        setEditLabel(device.label);
    }

    function handleSaveEdit() {
        if (!editingId || !editLabel.trim()) return;
        renameMutation.mutate({ id: editingId, label: editLabel.trim() });
    }

    function handleCancelEdit() {
        setEditingId(null);
        setEditLabel('');
    }

    function handleCreate() {
        if (!newLabel.trim()) return;
        createMutation.mutate(newLabel.trim());
    }

    if (isLoading) {
        return (
            <div className="card p-6">
                <h3 className="font-semibold mb-4">Registered Devices</h3>
                <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading devices...
                </div>
            </div>
        );
    }

    return (
        <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-gold-light)]">
                        <Smartphone className="h-5 w-5 text-[var(--accent-gold)]" />
                    </div>
                    <div>
                        <h3 className="font-semibold">Registered Devices</h3>
                        <p className="text-sm text-[var(--text-muted)]">
                            Named devices for targeted push notifications
                        </p>
                    </div>
                </div>
                {!showAddForm && (
                    <Button
                        variant="secondary"
                        onClick={() => setShowAddForm(true)}
                        className="flex items-center gap-1"
                    >
                        <Plus className="h-4 w-4" />
                        Add Device
                    </Button>
                )}
            </div>

            {/* Error display */}
            {(error || createMutation.error || renameMutation.error || deleteMutation.error) && (
                <div className="mb-4 rounded-lg bg-[var(--error-light)] p-3 text-sm text-[var(--error)] flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {(error as Error)?.message ||
                        createMutation.error?.message ||
                        renameMutation.error?.message ||
                        deleteMutation.error?.message}
                </div>
            )}

            {/* Add device form */}
            {showAddForm && (
                <div className="mb-4 flex items-center gap-2">
                    <Input
                        type="text"
                        placeholder="e.g. Sam's iPhone"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                        autoFocus
                    />
                    <Button
                        onClick={handleCreate}
                        disabled={!newLabel.trim() || createMutation.isPending}
                    >
                        {createMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Check className="h-4 w-4" />
                        )}
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setShowAddForm(false);
                            setNewLabel('');
                        }}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            )}

            {/* Devices list */}
            {devices.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] py-4 text-center">
                    No devices registered yet. Devices are automatically created
                    when users enable push notifications, or add one manually above.
                </p>
            ) : (
                <div className="space-y-2">
                    {devices.map((device) => (
                        <div
                            key={device.id}
                            className="flex items-center gap-3 rounded-lg bg-[var(--bg-tertiary)] p-3 transition-colors"
                        >
                            {/* Device icon */}
                            <Smartphone className="h-5 w-5 text-[var(--text-muted)] shrink-0" />

                            {/* Label (editable or display) */}
                            <div className="flex-1 min-w-0">
                                {editingId === device.id ? (
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="text"
                                            value={editLabel}
                                            onChange={(e) => setEditLabel(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleSaveEdit();
                                                if (e.key === 'Escape') handleCancelEdit();
                                            }}
                                            autoFocus
                                            className="h-8 text-sm"
                                        />
                                        <button
                                            onClick={handleSaveEdit}
                                            disabled={!editLabel.trim() || renameMutation.isPending}
                                            className="p-1 rounded hover:bg-[var(--bg-secondary)]"
                                            title="Save"
                                        >
                                            {renameMutation.isPending ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Check className="h-4 w-4 text-[var(--success)]" />
                                            )}
                                        </button>
                                        <button
                                            onClick={handleCancelEdit}
                                            className="p-1 rounded hover:bg-[var(--bg-secondary)]"
                                            title="Cancel"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <p className="font-medium text-sm truncate">
                                            {device.label}
                                        </p>
                                        <p className="text-xs text-[var(--text-muted)] truncate">
                                            {device.pushSubscription ? (
                                                <>
                                                    {device.pushSubscription.user.name || device.pushSubscription.user.email}
                                                    {' · '}
                                                    Linked
                                                </>
                                            ) : (
                                                <span className="flex items-center gap-1">
                                                    <Unlink className="h-3 w-3" />
                                                    Not linked to a subscription
                                                </span>
                                            )}
                                        </p>
                                    </>
                                )}
                            </div>

                            {/* Actions */}
                            {editingId !== device.id && (
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        onClick={() => handleStartEdit(device)}
                                        className="p-1.5 rounded-md hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                                        title="Rename device"
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (window.confirm(`Remove "${device.label}" from registered devices?`)) {
                                                deleteMutation.mutate(device.id);
                                            }
                                        }}
                                        disabled={deleteMutation.isPending}
                                        className="p-1.5 rounded-md hover:bg-[var(--error-light)] text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
                                        title="Delete device"
                                    >
                                        {deleteMutation.isPending ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-4 w-4" />
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
