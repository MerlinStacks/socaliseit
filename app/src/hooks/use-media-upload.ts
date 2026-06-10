"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { toast } from "@/components/ui/toast"

/**
 * Uploaded media result from API
 * Why: Typed response for callers to work with uploaded assets
 */
export interface UploadedMedia {
    id: string
    url: string
    transcodedUrl?: string | null
    thumbnailUrl?: string
    type: 'image' | 'video' | 'audio'
    mimeType: string
    size: number
    filename: string
    /** Why: Needed by validation to check platform min/max pixel requirements */
    width?: number
    height?: number
    /** Duration in seconds (videos only) */
    duration?: number
    /** Async transcode status: null = not needed, 'pending' | 'processing' | 'completed' | 'failed' */
    transcodeStatus?: string | null
}

/**
 * Upload progress state
 */
export interface UploadProgress {
    isUploading: boolean
    progress: number
    currentFile: number
    totalFiles: number
}

/**
 * Hook for uploading media files with progress tracking via XMLHttpRequest
 * Why: fetch() doesn't support upload progress events, XHR does
 */
export function useMediaUpload() {
    const [uploadState, setUploadState] = useState<UploadProgress>({
        isUploading: false,
        progress: 0,
        currentFile: 0,
        totalFiles: 0,
    })
    const activeXhrRef = useRef<XMLHttpRequest | null>(null)

    /**
     * Upload a single file with progress tracking
     */
    const uploadFile = useCallback((
        file: File,
        folderId: string | null,
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
                    const fileProgress = event.loaded / event.total
                    const overallProgress = ((fileIndex + fileProgress) / totalFiles) * 100
                    setUploadState(prev => ({
                        ...prev,
                        progress: Math.round(overallProgress),
                        currentFile: fileIndex + 1,
                    }))
                }
            }

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const data = JSON.parse(xhr.responseText)
                        resolve({
                            id: data.id,
                            url: data.url,
                            transcodedUrl: data.transcodedUrl ?? null,
                            thumbnailUrl: data.thumbnailUrl,
                            type: data.type,
                            mimeType: data.mimeType,
                            size: data.size,
                            filename: data.filename,
                            width: data.dimensions?.width,
                            height: data.dimensions?.height,
                            duration: data.duration,
                            transcodeStatus: data.transcodeStatus ?? null,
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
            activeXhrRef.current = xhr
            xhr.send(formData)
        })
    }, [])

    /**
     * Upload multiple files sequentially with overall progress tracking
     */
    const uploadFiles = useCallback(async (
        files: File[],
        folderId: string | null
    ): Promise<UploadedMedia[]> => {
        if (files.length === 0) return []

        setUploadState({
            isUploading: true,
            progress: 0,
            currentFile: 0,
            totalFiles: files.length,
        })

        const results: UploadedMedia[] = []

        for (let i = 0; i < files.length; i++) {
            const result = await uploadFile(files[i], folderId, i, files.length)
            if (result) {
                results.push(result)
            }
        }

        setUploadState({
            isUploading: false,
            progress: 100,
            currentFile: files.length,
            totalFiles: files.length,
        })
        activeXhrRef.current = null

        return results
    }, [uploadFile])

    /** Why: Abort any in-flight XHR if the component unmounts mid-upload */
    useEffect(() => {
        return () => {
            if (activeXhrRef.current) {
                activeXhrRef.current.abort()
                activeXhrRef.current = null
            }
        }
    }, [])

    const resetProgress = useCallback(() => {
        setUploadState({
            isUploading: false,
            progress: 0,
            currentFile: 0,
            totalFiles: 0,
        })
    }, [])

    return {
        uploadFiles,
        uploadState,
        resetProgress,
        isUploading: uploadState.isUploading,
        progress: uploadState.progress,
    }
}
