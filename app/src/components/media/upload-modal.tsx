"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { Upload, X, Film, Image, Loader2, AlertTriangle, CheckCircle, Search, FolderOpen, Check, Zap } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogFooter } from "@/components/ui/dialog"
import { MediaFolder } from "@/types/media"
import { getMediaAspectStatus, PLATFORM_LIMITS } from "@/lib/validation"
import { formatFileSize } from "@/lib/formatters"
import { compressImage, type CompressionResult } from "@/lib/image-compression"

interface FileWithDimensions extends File {
    width?: number
    height?: number
    compressionResult?: CompressionResult
}

/**
 * Media item returned from upload API
 * Why: Allows callers to receive uploaded media data without a separate fetch
 */
export interface UploadedMedia {
    id: string
    url: string
    thumbnailUrl?: string
    type: 'image' | 'video' | 'audio'
    mimeType: string
    size: number
    filename: string
}

/**
 * Library media item from API
 * Why: Matches the shape returned by GET /api/media
 */
interface LibraryMedia {
    id: string
    filename: string
    url: string
    thumbnailUrl: string | null
    type: 'image' | 'video' | 'audio'
    mimeType: string
    size: number
    dimensions: { width: number; height: number } | null
    duration: number | null
}

interface UploadModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    folders: MediaFolder[]
    defaultFolderId: string | null
    /** Called after uploads complete with the array of uploaded media items */
    onUpload: (uploadedMedia: UploadedMedia[]) => Promise<void>
    /** Target platform for aspect ratio validation (optional) */
    targetPlatform?: keyof typeof PLATFORM_LIMITS
}

type TabType = 'library' | 'upload'

export function UploadModal({ open, onOpenChange, folders, defaultFolderId, onUpload, targetPlatform = 'instagram' }: UploadModalProps) {
    const [activeTab, setActiveTab] = useState<TabType>('library')

    // Library state
    const [libraryMedia, setLibraryMedia] = useState<LibraryMedia[]>([])
    const [libraryLoading, setLibraryLoading] = useState(false)
    const [librarySearch, setLibrarySearch] = useState('')
    const [selectedLibraryIds, setSelectedLibraryIds] = useState<Set<string>>(new Set())

    // Upload state
    const [isDragging, setIsDragging] = useState(false)
    const [files, setFiles] = useState<FileWithDimensions[]>([])
    const [folderId, setFolderId] = useState<string>(defaultFolderId || "")
    const [isUploading, setIsUploading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(0)
    const [isCompressing, setIsCompressing] = useState(false)
    const [compressionProgress, setCompressionProgress] = useState(0)
    const fileInputRef = useRef<HTMLInputElement>(null)

    /**
     * Fetch library media when modal opens or search changes
     * Why: Enables browsing existing media library
     */
    const fetchLibraryMedia = useCallback(async () => {
        setLibraryLoading(true)
        try {
            const params = new URLSearchParams()
            if (librarySearch) params.set('search', librarySearch)
            params.set('limit', '50')

            const response = await fetch(`/api/media?${params}`)
            if (!response.ok) throw new Error('Failed to fetch media')

            const data = await response.json()
            setLibraryMedia(data.media || [])
        } catch (error) {
            console.error('Error fetching library media:', error)
            toast('error', 'Failed to load media library')
        } finally {
            setLibraryLoading(false)
        }
    }, [librarySearch])

    // Fetch library on open and search change
    useEffect(() => {
        if (open && activeTab === 'library') {
            const debounceTimer = setTimeout(fetchLibraryMedia, 300)
            return () => clearTimeout(debounceTimer)
        }
    }, [open, activeTab, fetchLibraryMedia])

    // Reset state when modal closes
    useEffect(() => {
        if (!open) {
            setSelectedLibraryIds(new Set())
            setFiles([])
            setLibrarySearch('')
            setActiveTab('library')
        }
    }, [open])

    /**
     * Toggle library item selection
     */
    const toggleLibrarySelection = (id: string) => {
        setSelectedLibraryIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }

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
            await processFiles(droppedFiles)
        }
    }

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const selectedFiles = Array.from(e.target.files)
            await processFiles(selectedFiles)
        }
    }

    /**
     * Process files: extract dimensions and compress images
     * Why: Combines dimension extraction and compression in one flow
     */
    const processFiles = async (newFiles: File[]) => {
        setIsCompressing(true)
        setCompressionProgress(0)

        const processedFiles: FileWithDimensions[] = []

        for (let i = 0; i < newFiles.length; i++) {
            const file = newFiles[i]

            // Extract dimensions first
            const fileWithDims = await extractDimensions(file)

            // Compress images (skip videos)
            if (file.type.startsWith('image/')) {
                const compressionResult = await compressImage(file, {
                    maxSizeMB: 2,
                    onProgress: (progress) => {
                        // Combined progress: files completed + current file progress
                        const overallProgress = ((i + progress / 100) / newFiles.length) * 100
                        setCompressionProgress(Math.round(overallProgress))
                    }
                })

                // Use compressed file if it was compressed
                if (compressionResult.wasCompressed) {
                    const compressedWithDims = compressionResult.file as FileWithDimensions
                    compressedWithDims.width = fileWithDims.width
                    compressedWithDims.height = fileWithDims.height
                    compressedWithDims.compressionResult = compressionResult
                    processedFiles.push(compressedWithDims)

                    toast('info', `Compressed ${file.name}`,
                        `${formatFileSize(compressionResult.originalSize)} → ${formatFileSize(compressionResult.compressedSize)} (${Math.round((1 - 1 / compressionResult.compressionRatio) * 100)}% smaller)`
                    )
                } else {
                    processedFiles.push(fileWithDims)
                }
            } else {
                processedFiles.push(fileWithDims)
            }

            setCompressionProgress(Math.round(((i + 1) / newFiles.length) * 100))
        }

        setIsCompressing(false)
        setFiles((prev) => [...prev, ...processedFiles])
    }

    const removeFile = (index: number) => {
        setFiles((prev) => prev.filter((_, i) => i !== index))
    }

    /**
     * Upload a single file with progress tracking via XMLHttpRequest
     * Why: fetch() doesn't support upload progress events, XHR does
     */
    const uploadFileWithProgress = (
        file: File,
        fileIndex: number,
        totalFiles: number
    ): Promise<UploadedMedia | null> => {
        return new Promise((resolve) => {
            const formData = new FormData()
            formData.append("file", file)
            if (folderId) formData.append("folderId", folderId)

            const xhr = new XMLHttpRequest()

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    // Calculate combined progress: completed files + current file progress
                    const fileProgress = event.loaded / event.total
                    const overallProgress = ((fileIndex + fileProgress) / totalFiles) * 100
                    setUploadProgress(Math.round(overallProgress))
                }
            }

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const data = JSON.parse(xhr.responseText)
                        resolve({
                            id: data.id,
                            url: data.url,
                            thumbnailUrl: data.thumbnailUrl,
                            type: data.type,
                            mimeType: data.mimeType,
                            size: data.size,
                            filename: data.filename,
                        })
                    } catch {
                        toast('error', `Upload failed: ${file.name}`, 'Invalid server response')
                        resolve(null)
                    }
                } else {
                    try {
                        const errorData = JSON.parse(xhr.responseText)
                        toast('error', `Upload failed: ${file.name}`, errorData.error || 'Unknown error')
                    } catch {
                        toast('error', `Upload failed: ${file.name}`, `Server error (${xhr.status})`)
                    }
                    resolve(null)
                }
            }

            xhr.onerror = () => {
                toast('error', `Upload failed: ${file.name}`, 'Network error')
                resolve(null)
            }

            xhr.open('POST', '/api/media')
            xhr.send(formData)
        })
    }

    /**
     * Handle submission - combine library selections and uploaded files
     */
    const handleSubmit = async () => {
        const allMedia: UploadedMedia[] = []

        // Add selected library items
        for (const id of selectedLibraryIds) {
            const item = libraryMedia.find(m => m.id === id)
            if (item) {
                allMedia.push({
                    id: item.id,
                    url: item.url,
                    thumbnailUrl: item.thumbnailUrl || undefined,
                    type: item.type,
                    mimeType: item.mimeType,
                    size: item.size,
                    filename: item.filename,
                })
            }
        }

        // Upload new files if any
        if (files.length > 0) {
            setIsUploading(true)
            setUploadProgress(0)

            for (let i = 0; i < files.length; i++) {
                const result = await uploadFileWithProgress(files[i], i, files.length)
                if (result) {
                    allMedia.push(result)
                }
            }

            setIsUploading(false)
        }

        if (allMedia.length > 0) {
            await onUpload(allMedia)
        }

        setFiles([])
        setSelectedLibraryIds(new Set())
        onOpenChange(false)
    }

    const totalSelected = selectedLibraryIds.size + files.length
    const canSubmit = totalSelected > 0 && !isUploading

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col" data-testid="upload-modal">
                <DialogHeader>
                    <DialogTitle>Add Media</DialogTitle>
                    <DialogClose onClick={() => onOpenChange(false)} />
                </DialogHeader>

                {/* Tab Navigation */}
                <div className="flex border-b border-[var(--border)]">
                    <button
                        onClick={() => setActiveTab('library')}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === 'library'
                            ? 'border-b-2 border-[var(--accent-gold)] text-[var(--text-primary)]'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                            }`}
                    >
                        <FolderOpen className="h-4 w-4" />
                        Library
                        {selectedLibraryIds.size > 0 && (
                            <span className="ml-1 rounded-full bg-[var(--accent-gold)] px-1.5 py-0.5 text-xs text-white">
                                {selectedLibraryIds.size}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('upload')}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === 'upload'
                            ? 'border-b-2 border-[var(--accent-gold)] text-[var(--text-primary)]'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                            }`}
                    >
                        <Upload className="h-4 w-4" />
                        Upload
                        {files.length > 0 && (
                            <span className="ml-1 rounded-full bg-[var(--accent-gold)] px-1.5 py-0.5 text-xs text-white">
                                {files.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-hidden">
                    {activeTab === 'library' ? (
                        <div className="flex flex-col h-full">
                            {/* Search */}
                            <div className="p-4 pb-2">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                                    <input
                                        type="text"
                                        placeholder="Search media..."
                                        value={librarySearch}
                                        onChange={(e) => setLibrarySearch(e.target.value)}
                                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--accent-gold)]"
                                    />
                                </div>
                            </div>

                            {/* Media Grid */}
                            <div className="flex-1 overflow-y-auto p-4 pt-2">
                                {libraryLoading ? (
                                    <div className="flex h-full items-center justify-center">
                                        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent-gold)]" />
                                    </div>
                                ) : libraryMedia.length === 0 ? (
                                    <div className="flex h-full flex-col items-center justify-center text-center">
                                        <FolderOpen className="mb-3 h-12 w-12 text-[var(--text-muted)]" />
                                        <p className="text-sm text-[var(--text-muted)]">
                                            {librarySearch ? 'No media found' : 'No media in library'}
                                        </p>
                                        <Button
                                            variant="ghost"
                                            className="mt-2"
                                            onClick={() => setActiveTab('upload')}
                                        >
                                            Upload new media
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-4 gap-2">
                                        {libraryMedia
                                            .filter(m => m.type === 'image' || m.type === 'video')
                                            .map((item) => {
                                                const isSelected = selectedLibraryIds.has(item.id)
                                                return (
                                                    <div
                                                        key={item.id}
                                                        onClick={() => toggleLibrarySelection(item.id)}
                                                        className={`group relative aspect-square cursor-pointer overflow-hidden rounded-lg border-2 transition-all ${isSelected
                                                            ? 'border-[var(--accent-gold)] ring-2 ring-[var(--accent-gold)]'
                                                            : 'border-transparent hover:border-[var(--border)]'
                                                            }`}
                                                    >
                                                        {/* Show thumbnail for images, or thumbnailUrl for videos with generated thumbnails */}
                                                        {/* Videos without thumbnails get a fallback Film icon */}
                                                        {item.type === 'video' && !item.thumbnailUrl ? (
                                                            <div className="flex h-full w-full items-center justify-center bg-[var(--bg-tertiary)]">
                                                                <Film className="h-6 w-6 text-[var(--text-muted)]" />
                                                            </div>
                                                        ) : item.thumbnailUrl || item.url ? (
                                                            <img
                                                                src={item.thumbnailUrl || item.url}
                                                                alt={item.filename}
                                                                className="h-full w-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="flex h-full w-full items-center justify-center bg-[var(--bg-tertiary)]">
                                                                <Image className="h-6 w-6 text-[var(--text-muted)]" />
                                                            </div>
                                                        )}

                                                        {/* Selection indicator */}
                                                        <div
                                                            className={`absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all ${isSelected
                                                                ? 'border-[var(--accent-gold)] bg-[var(--accent-gold)]'
                                                                : 'border-white/80 bg-white/40 opacity-0 group-hover:opacity-100'
                                                                }`}
                                                        >
                                                            {isSelected && <Check className="h-3 w-3 text-white" />}
                                                        </div>

                                                        {/* Type badge */}
                                                        <div className="absolute right-1.5 top-1.5 rounded bg-black/60 p-1">
                                                            {item.type === 'video' ? (
                                                                <Film className="h-3 w-3 text-white" />
                                                            ) : (
                                                                <Image className="h-3 w-3 text-white" />
                                                            )}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="p-4">
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
                                <div className="mb-4 max-h-48 space-y-2 overflow-y-auto">
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
                                                            {formatFileSize(file.size)}
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
                            <div>
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

                            {/* Compression Progress */}
                            {isCompressing && (
                                <div className="mt-4" data-testid="compression-progress">
                                    <div className="mb-1 flex justify-between text-xs text-[var(--text-muted)]">
                                        <span className="flex items-center gap-1">
                                            <Zap className="h-3 w-3" />
                                            Compressing images...
                                        </span>
                                        <span>{compressionProgress}%</span>
                                    </div>
                                    <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                                        <div
                                            className="h-full rounded-full bg-purple-500 transition-all"
                                            style={{ width: `${compressionProgress}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Upload Progress */}
                            {isUploading && (
                                <div className="mt-4" data-testid="upload-progress">
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
                    )}
                </div>

                <DialogFooter className="px-6 pb-6 pt-2 border-t border-[var(--border)]">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isUploading}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={!canSubmit}>
                        {isUploading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Uploading...
                            </>
                        ) : (
                            <>
                                <Check className="h-4 w-4 mr-2" />
                                Add {totalSelected > 0 ? `(${totalSelected})` : ''}
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
