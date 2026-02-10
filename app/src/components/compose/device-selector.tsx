'use client';

/**
 * Device Selector Component
 * Multi-select dropdown for choosing notification target devices.
 *
 * Why: When auto-publish is disabled, users need to select which
 * registered devices should receive the "ready to publish" reminder.
 */

import { useQuery } from '@tanstack/react-query';
import { Smartphone, Loader2, Check } from 'lucide-react';

interface DeviceOption {
    id: string;
    label: string;
    pushSubscriptionId: string | null;
}

interface DeviceSelectorProps {
    /** Currently selected device IDs */
    selectedIds: string[];
    /** Callback when selection changes */
    onChange: (ids: string[]) => void;
}

/**
 * Renders a compact multi-select checklist of registered devices.
 * Fetches device list from the notification-devices API.
 */
export function DeviceSelector({ selectedIds, onChange }: DeviceSelectorProps) {
    const { data: devices = [], isLoading } = useQuery<DeviceOption[]>({
        queryKey: ['notification-devices-selector'],
        queryFn: async () => {
            const res = await fetch('/api/settings/notification-devices');
            if (!res.ok) return [];
            const data = await res.json();
            return data.devices.map((d: DeviceOption) => ({
                id: d.id,
                label: d.label,
                pushSubscriptionId: d.pushSubscriptionId,
            }));
        },
        staleTime: 60_000,
    });

    function handleToggle(deviceId: string) {
        if (selectedIds.includes(deviceId)) {
            onChange(selectedIds.filter((id) => id !== deviceId));
        } else {
            onChange([...selectedIds, deviceId]);
        }
    }

    function handleSelectAll() {
        const linkedIds = devices
            .filter((d) => d.pushSubscriptionId)
            .map((d) => d.id);
        onChange(linkedIds);
    }

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] py-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading devices...
            </div>
        );
    }

    if (devices.length === 0) {
        return (
            <p className="text-xs text-[var(--text-muted)] py-2">
                No devices registered. Enable push notifications in Settings to add devices.
            </p>
        );
    }

    const linkedDevices = devices.filter((d) => d.pushSubscriptionId);

    return (
        <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-[var(--text-muted)]">
                    Notify devices
                </span>
                {linkedDevices.length > 1 && (
                    <button
                        onClick={handleSelectAll}
                        className="text-xs text-[var(--accent-gold)] hover:underline"
                    >
                        Select all
                    </button>
                )}
            </div>
            {devices.map((device) => {
                const isLinked = Boolean(device.pushSubscriptionId);
                const isSelected = selectedIds.includes(device.id);

                return (
                    <label
                        key={device.id}
                        className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors ${isLinked
                                ? 'hover:bg-[var(--bg-tertiary)]'
                                : 'opacity-50 cursor-not-allowed'
                            }`}
                    >
                        <div
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${isSelected
                                    ? 'bg-[var(--accent-gold)] border-[var(--accent-gold)]'
                                    : 'border-[var(--border)]'
                                }`}
                        >
                            {isSelected && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggle(device.id)}
                            disabled={!isLinked}
                            className="sr-only"
                        />
                        <Smartphone className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                        <span className="truncate">{device.label}</span>
                        {!isLinked && (
                            <span className="text-xs text-[var(--text-muted)]">(unlinked)</span>
                        )}
                    </label>
                );
            })}
        </div>
    );
}
