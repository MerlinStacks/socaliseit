"use client"

import { useState, useCallback, useRef } from "react"
import { toast } from "@/components/ui/toast"
import { useMediaUpload, type UploadedMedia } from "@/hooks/use-media-upload"

/** Accepted MIME types for drag-and-drop uploads */
const ACCEPTED_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/quicktime',
])

/**
 * Hook for handling drag-and-drop media uploads on the post composer.
 * Why: Lets users drag files directly onto the composer instead of
 * opening the upload modal, matching the behaviour of the media section.
 *
 * @param onMediaUploaded - callback that receives uploaded media (same shape
 *   as UploadModal's onUpload). Typically `compose.handleMediaUpload`.
 */
export function useComposerDrop(
    onMediaUploaded: (media: UploadedMedia[]) => Promise<void>,
) {
    const [isDragOver, setIsDragOver] = useState(false)
    const dragCounter = useRef(0)
    const { uploadFiles, isUploading, progress } = useMediaUpload()

    /**
     * Filter dropped files to accepted media types.
     * Why: Prevents uploading unsupported files and gives early feedback.
     */
    const filterFiles = useCallback((files: File[]): File[] => {
        const accepted: File[] = []
        const rejected: string[] = []

        for (const file of files) {
            if (ACCEPTED_TYPES.has(file.type)) {
                accepted.push(file)
            } else {
                rejected.push(file.name)
            }
        }

        if (rejected.length > 0) {
            toast(
                'warning',
                'Unsupported files skipped',
                `${rejected.join(', ')} — only JPEG, PNG, WebP, GIF, MP4 are accepted.`,
            )
        }

        return accepted
    }, [])

    /** Increment drag counter on enter to handle nested elements */
    const onDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        dragCounter.current += 1
        if (e.dataTransfer.types.includes('Files')) {
            setIsDragOver(true)
        }
    }, [])

    /** Decrement drag counter on leave; hide overlay when counter hits 0 */
    const onDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        dragCounter.current -= 1
        if (dragCounter.current <= 0) {
            dragCounter.current = 0
            setIsDragOver(false)
        }
    }, [])

    /** Required to allow drop */
    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
    }, [])

    /** Handle drop: upload files then pass to composer state */
    const onDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        dragCounter.current = 0
        setIsDragOver(false)

        const droppedFiles = Array.from(e.dataTransfer.files)
        const validFiles = filterFiles(droppedFiles)

        if (validFiles.length === 0) return

        toast('info', `Uploading ${validFiles.length} file${validFiles.length > 1 ? 's' : ''}…`)

        const uploaded = await uploadFiles(validFiles, null)

        if (uploaded.length > 0) {
            await onMediaUploaded(uploaded)
            toast('success', `${uploaded.length} file${uploaded.length > 1 ? 's' : ''} added`)
        }
    }, [filterFiles, uploadFiles, onMediaUploaded])

    return {
        /** Bind these to the container element */
        dropHandlers: {
            onDragEnter,
            onDragLeave,
            onDragOver,
            onDrop,
        },
        /** True while the user is dragging files over the composer */
        isDragOver,
        /** True while files are being uploaded */
        isUploading,
        /** Upload progress 0-100 */
        progress,
    }
}
