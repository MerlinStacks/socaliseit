/**
 * Location Picker Component
 * Input for geo-tagging posts on platforms that support it (Instagram, TikTok, Facebook)
 *
 * Why: Enables users to add location tags to posts for better discoverability
 * Note: For MVP, this is a simple text input for location ID/name.
 * A search-based picker using Facebook Places API can be added as enhancement.
 */

'use client';

import { MapPin } from 'lucide-react';
import type { Platform } from '@/lib/platform-config';

interface LocationPickerProps {
    value?: string;
    onChange: (location: string | undefined) => void;
    platform: Platform;
}

/**
 * Location picker for Instagram, TikTok, and Facebook posts
 * Why: These platforms support geo-tagging which improves post discoverability
 */
export function LocationPicker({ value, onChange }: LocationPickerProps) {
    return (
        <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                <MapPin className="h-4 w-4" />
            </div>
            <input
                type="text"
                value={value || ''}
                onChange={(e) => onChange(e.target.value || undefined)}
                placeholder="Enter location name or ID..."
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] py-2 pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent-gold)]"
            />
        </div>
    );
}
