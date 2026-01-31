"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Upload, X, Film, Image, Loader2, AlertTriangle, CheckCircle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogFooter } from "@/components/ui/dialog"
import { MediaFolder } from "@/types/media"
import { getMediaAspectStatus, PLATFORM_LIMITS } from "@/lib/validation"

interface FileWithDimensions extends File {
    width?: number
    height?: number
}

interface UploadModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    folders: MediaFolder[]
    defaultFolderId: string | null
    onUpload: () => Promise<void>
    /** Target platform for aspect ratio validation (optional) */
    targetPlatform?: keyof typeof PLATFORM_LIMITS
}

export function UploadModal({ open, onOpenChange, folders, defaultFolderId, onUpload, targetPlatform = 'instagram' }: UploadModalProps) {
    const [isDragging, setIsDragging] = useState(false)
    const [files, setFiles] = useState<FileWithDimensions[]>([])
    const [folderId, setFolderId] = useState<string>(defaultFolderId || "")
    const [isUploading, setIsUploading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(0)
    const fileInputRef = useRef<HTMLInputElement>(null)

    /**
     * Extract dimensions from image/video files for aspect ratio validation
     * Why: Catches suboptimal dimensions before upload completes
     */
    const extractDimensions = async (file: File): Promise<FileWithDimensions> => {
        return new Promise((resolve) => {
            if (file.type.startsWith('image/')) {
                const img = new window.Image()
                img.onload = () => {
                    const enhanced = file as FileWithDimensions
                    enhanced.width = img.width
                    enhanced.height = img.height
                    URL.revokeObjectURL(img.src)
                    resolve(enhanced)
                }
                img.onerror = () => resolve(file)
                img.src = URL.createObjectURL(file)
            } else if (file.type.startsWith('video/')) {
                const video = document.createElement('video')
                video.onloadedmetadata = () => {
                    const enhanced = file as FileWithDimensions
                    enhanced.width = video.videoWidth
                    enhanced.height = video.videoHeight
                    URL.revokeObjectURL(video.src)
                    resolve(enhanced)
                }
                video.onerror = () => resolve(file)
                video.src = URL.createObjectURL(file)
            } else {
                resolve(file)
            }
        })
    }

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        if (e.dataTransfer.files) {
            const droppedFiles = Array.from(e.dataTransfer.files)
            const filesWithDims = await Promise.all(droppedFiles.map(extractDimensions))
            setFiles((prev) => [...prev, ...filesWithDims])
        }
    }

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const selectedFiles = Array.from(e.target.files)
            const filesWithDims = await Promise.all(selectedFiles.map(extractDimensions))
            setFiles((prev) => [...prev, ...filesWithDims])
        }
    }

    const removeFile = (index: number) => {
        setFiles((prev) => prev.filter((_, i) => i !== index))
    }

    const handleUpload = async () => {
        if (files.length === 0) return

        setIsUploading(true)
        let uploaded = 0

        // In a real app, you might want to upload concurrently or use a different strategy
        for (const file of files) {
            try {
                const formData = new FormData()
                formData.append("file", file)
                if (folderId) formData.append("folderId", folderId)

                const res = await fetch("/api/media", {
                    method: "POST",
                    body: formData,
                })

                if (!res.ok) {
                    const data = await res.json()
                    console.error(`Failed to upload ${file.name}:`, data.error)
                }
            } catch (err) {
                console.error(`Failed to upload ${file.name}:`, err)
            }

            uploaded++
            setUploadProgress(Math.round((uploaded / files.length) * 100))
        }

        await onUpload()
        setIsUploading(false)
        setFiles([]) // Clear files after successful upload
        onOpenChange(false)
    }

    /* Format file size helper */
    function formatSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Upload Media</DialogTitle>
                    <DialogClose onClick={() => onOpenChange(false)} />
                </DialogHeader>

                <div className="p-6 pt-2">
                    {/* Drop zone */}
                    <div
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${isDragging
                            ? 'border-[var(--accent-gold)] bg-[var(--accent-gold-light)]'
                            : 'border-[var(--border)] hover:border-[var(--accent-gold)]'
                            }`}
                    >
                        <Upload className="mb-3 h-10 w-10 text-[var(--text-muted)]" />
                        <p className="text-sm text-[var(--text-secondary)]">
                            Drag & drop files here or click to browse
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                            JPEG, PNG, WebP, GIF, MP4 up to 50MB
                        </p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime"
                            onChange={handleFileSelect}
                            className="hidden"
                        />
                    </div>

                    {/* File list */}
                    {files.length > 0 && (
                        <div className="mb-4 max-h-60 space-y-2 overflow-y-auto">
                            {files.map((file, i) => {
                                // Get aspect ratio status if dimensions available
                                const aspectStatus = file.width && file.height
                                    ? getMediaAspectStatus(file.width, file.height, targetPlatform)
                                    : null

                                return (
                                    <div
                                        key={i}
                                        className="rounded-lg bg-[var(--bg-tertiary)] px-3 py-2"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                {file.type.startsWith('video/') ? (
                                                    <Film className="h-4 w-4 flex-shrink-0 text-[var(--text-muted)]" />
                                                ) : (
                                                    <Image className="h-4 w-4 flex-shrink-0 text-[var(--text-muted)]" />
                                                )}
                                                <span className="truncate text-sm">{file.name}</span>
                                                <span className="flex-shrink-0 text-xs text-[var(--text-muted)]">
                                                    {formatSize(file.size)}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => removeFile(i)}
                                                className="flex-shrink-0 p-1 text-[var(--text-muted)] hover:text-[var(--error)]"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                        {/* Aspect ratio validation indicator */}
                                        {aspectStatus && (
                                            <div className={`mt-1.5 flex items-center gap-1.5 text-xs ${aspectStatus.status === 'ok' ? 'text-[var(--success)]' :
                                                    aspectStatus.status === 'warning' ? 'text-[var(--warning)]' :
                                                        'text-[var(--error)]'
                                                }`}>
                                                {aspectStatus.status === 'ok' ? (
                                                    <CheckCircle className="h-3 w-3" />
                                                ) : (
                                                    <AlertTriangle className="h-3 w-3" />
                                                )}
                                                <span>
                                                    {file.width}×{file.height} ({aspectStatus.ratioString})
                                                    {aspectStatus.status !== 'ok' && ` — ${aspectStatus.message}`}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {/* Folder selector */}
                    <div className="mb-6">
                        <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
                            Upload to folder
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

                    {/* Progress */}
                    {isUploading && (
                        <div className="mb-4">
                            <div className="mb-1 flex justify-between text-xs text-[var(--text-muted)]">
                                <span>Uploading...</span>
                                <span>{uploadProgress}%</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                                <div
                                    className="h-full rounded-full bg-[var(--accent-gold)] transition-all"
                                    style={{ width: `${uploadProgress}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="px-6 pb-6">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isUploading}>
                        Cancel
                    </Button>
                    <Button onClick={handleUpload} disabled={files.length === 0 || isUploading}>
                        {isUploading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Uploading...
                            </>
                        ) : (
                            <>
                                <Upload className="h-4 w-4 mr-2" />
                                Upload {files.length > 0 && `(${files.length})`}
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
