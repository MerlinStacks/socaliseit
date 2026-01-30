"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogFooter } from "@/components/ui/dialog"
import { MediaItem, MediaFolder } from "@/types/media"

interface EditMediaModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    media: MediaItem
    folders: MediaFolder[]
    onSave: () => Promise<void>
}

export function EditMediaModal({ open, onOpenChange, media, folders, onSave }: EditMediaModalProps) {
    const [filename, setFilename] = useState(media.filename)
    const [tagsInput, setTagsInput] = useState(media.tags.join(", "))
    const [folderId, setFolderId] = useState(media.folder?.id || "")
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSave = async () => {
        if (!filename.trim()) {
            setError("Filename cannot be empty")
            return
        }

        setIsSaving(true)
        setError(null)

        try {
            // Parse tags from comma-separated input
            const tags = tagsInput
                .split(",")
                .map((t) => t.trim().toLowerCase())
                .filter(Boolean)

            const res = await fetch("/api/media", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: media.id,
                    filename: filename.trim(),
                    tags,
                    folderId: folderId || null,
                }),
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || "Failed to update media")
            }

            await onSave()
            onOpenChange(false)
        } catch (err) {
            console.error(err)
            setError(err instanceof Error ? err.message : "Failed to update media")
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Edit Media Details</DialogTitle>
                    <DialogClose onClick={() => onOpenChange(false)} />
                </DialogHeader>

                <div className="space-y-4 p-6 pt-2">
                    {/* Preview */}
                    <div className="flex justify-center">
                        <div className="relative h-32 w-32 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)]">
                            {media.thumbnailUrl ? (
                                <img
                                    src={media.thumbnailUrl}
                                    alt={media.filename}
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-xs text-[var(--text-muted)]">
                                    No Preview
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Filename */}
                    <div>
                        <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
                            Filename
                        </label>
                        <Input
                            value={filename}
                            onChange={(e) => setFilename(e.target.value)}
                            placeholder="my-image.jpg"
                        />
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
                            Tags (comma separated)
                        </label>
                        <Input
                            value={tagsInput}
                            onChange={(e) => setTagsInput(e.target.value)}
                            placeholder="nature, social, instagram"
                        />
                    </div>

                    {/* Folder */}
                    <div>
                        <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
                            Folder
                        </label>
                        <select
                            value={folderId}
                            onChange={(e) => setFolderId(e.target.value)}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                        >
                            <option value="">Unfiled (root)</option>
                            {folders.map((f) => (
                                <option key={f.id} value={f.id}>
                                    {f.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {error && <p className="text-sm text-red-500">{error}</p>}
                </div>

                <DialogFooter className="px-6 pb-6">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Saving...
                            </>
                        ) : (
                            "Save Changes"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
