'use client';

/**
 * Google Business Location Picker Dialog
 * Why: GBP OAuth returns an account with multiple locations; user must select one.
 */

import { Loader2, Globe, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { GoogleIcon } from './platform-icons';
import type { GbpLocation } from './types';

interface GbpLocationPickerDialogProps {
    open: boolean;
    onClose: () => void;
    loading: boolean;
    locations: GbpLocation[];
    connecting: string | null;
    error: string | null;
    onSelectLocation: (location: GbpLocation) => void;
}

export function GbpLocationPickerDialog({
    open,
    onClose,
    loading,
    locations,
    connecting,
    error,
    onSelectLocation,
}: GbpLocationPickerDialogProps) {
    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent className="sm:max-w-md bg-[var(--bg-secondary)]/95 backdrop-blur-xl border border-white/10">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-white">
                            <GoogleIcon className="h-6 w-6" />
                        </div>
                        Select Business Location
                    </DialogTitle>
                    <DialogDescription className="text-[var(--text-muted)]">
                        Choose which business location you want to connect.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 pt-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
                            <span className="ml-2 text-sm text-[var(--text-muted)]">Loading locations...</span>
                        </div>
                    ) : locations.length === 0 ? (
                        <div className="text-center py-8">
                            <Globe className="h-10 w-10 mx-auto text-[var(--text-muted)] mb-3" />
                            <p className="text-sm text-[var(--text-muted)]">No business locations found.</p>
                            <p className="text-xs text-[var(--text-muted)] mt-1">
                                Make sure your Google Business Profile has verified locations.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {locations.map((location) => (
                                <button
                                    key={location.locationId}
                                    onClick={() => onSelectLocation(location)}
                                    disabled={connecting !== null}
                                    className="w-full p-3 rounded-lg border border-white/10 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)]/80 hover:border-white/20 transition-all text-left flex items-center justify-between group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-green-500/20 text-blue-400">
                                            <Globe className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-sm">{location.title}</p>
                                            <p className="text-xs text-[var(--text-muted)]">ID: {location.locationId}</p>
                                        </div>
                                    </div>
                                    {connecting === location.locationId ? (
                                        <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />
                                    ) : (
                                        <Check className="h-4 w-4 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                                    )}
                                </button>
                            ))}
                        </div>
                    )}

                    {error && (
                        <div className="rounded-lg bg-[var(--error-light)] px-3 py-2 text-sm text-[var(--error)]">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <Button
                            variant="secondary"
                            onClick={onClose}
                            className="flex-1"
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
