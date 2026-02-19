/**
 * Mobile Edit Media Bottom Sheet
 * Touch-friendly bottom sheet for editing media details on mobile PWA.
 *
 * Why: The desktop EditMediaModal uses a centered Dialog which is awkward on
 * small screens. This provides larger inputs, full-width preview, and a
 * bottom-anchored save button.
 */

'use client';

import { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import { MobileBottomSheet } from '@/components/mobile/mobile-bottom-sheet';
import { Button } from '@/components/ui/button';
import { triggerHaptic } from '@/hooks/use-haptic';
import { showErrorToast } from '@/lib/api-error';
import { MediaItem, MediaFolder } from '@/types/media';

interface MediaEditSheetProps {
    open: boolean;
    onClose: () => void;
    media: MediaItem;
    folders: MediaFolder[];
    onSave: () => Promise<void>;
}

/**
 * Bottom sheet for editing media filename, tags, and folder assignment.
 * Why: Replaces Dialog-based EditMediaModal on mobile for better touch UX.
 */
export function MediaEditSheet({ open, onClose, media, folders, onSave }: MediaEditSheetProps) {
    const [filename, setFilename] = useState(media.filename);
    const [tagsInput, setTagsInput] = useState(media.tags.join(', '));
    const [folderId, setFolderId] = useState(media.folder?.id || '');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Sync state when modal opens or media item changes.
     * Why: useState initializers only run on mount — when opening for a
     * different item, state must be explicitly updated.
     */
    useEffect(() => {
        if (open) {
            setFilename(media.filename);
            setTagsInput(media.tags.join(', '));
            setFolderId(media.folder?.id || '');
            setError(null);
        }
    }, [open, media.id, media.filename, media.tags, media.folder?.id]);

    /** Save changes via PATCH /api/media */
    const handleSave = async () => {
        if (!filename.trim()) {
            setError('Filename cannot be empty');
            return;
        }

        triggerHaptic('medium');
        setIsSaving(true);
        setError(null);

        try {
            const tags = tagsInput
                .split(',')
                .map(t => t.trim().toLowerCase())
                .filter(Boolean);

            const res = await fetch('/api/media', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: media.id,
                    filename: filename.trim(),
                    tags,
                    folderId: folderId || null,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to update media');
            }

            await onSave();
            onClose();
        } catch (err) {
            showErrorToast(err);
            setError(err instanceof Error ? err.message : 'Failed to update media');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <MobileBottomSheet
            open={open}
            onClose={onClose}
            title="Edit Media"
            snapPoints={[75, 90]}
            initialSnap={0}
        >
            <div className="flex flex-col h-full">
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Preview */}
                    <div className="flex justify-center">
                        <div className="relative h-40 w-full max-w-xs overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]">
                            {media.thumbnailUrl || media.url ? (
                                <img
                                    src={media.thumbnailUrl || media.url}
                                    alt={media.filename}
                                    className="h-full w-full object-contain"
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-sm text-[var(--text-muted)]">
                                    No Preview
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Filename */}
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                            Filename
                        </label>
                        <input
                            value={filename}
                            onChange={(e) => setFilename(e.target.value)}
                            placeholder="my-image.jpg"
                            className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 text-sm outline-none focus:border-[var(--accent-gold)]"
                        />
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                            Tags (comma separated)
                        </label>
                        <input
                            value={tagsInput}
                            onChange={(e) => setTagsInput(e.target.value)}
                            placeholder="nature, social, instagram"
                            className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 text-sm outline-none focus:border-[var(--accent-gold)]"
                        />
                    </div>

                    {/* Folder */}
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                            Folder
                        </label>
                        <select
                            value={folderId}
                            onChange={(e) => setFolderId(e.target.value)}
                            className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 text-sm outline-none focus:border-[var(--accent-gold)]"
                        >
                            <option value="">Unfiled (root)</option>
                            {folders.map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Error */}
                    {error && (
                        <p className="text-sm text-red-500">{error}</p>
                    )}
                </div>

                {/* Save Button */}
                <div className="border-t border-[var(--border)] p-4 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
                    <Button
                        className="w-full h-12 text-base"
                        onClick={handleSave}
                        disabled={isSaving}
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="h-5 w-5 mr-2" />
                                Save Changes
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </MobileBottomSheet>
    );
}
