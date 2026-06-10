"use client"

import { useState, useRef, useEffect } from "react"
import { Film } from "lucide-react"

interface VideoThumbnailProps {
    videoUrl: string
    alt: string
    className?: string
}

interface HoverVideoPreviewProps extends VideoThumbnailProps {
    posterUrl?: string | null
}

/**
 * VideoThumbnail Component
 * 
 * Why: Server-side FFmpeg thumbnail generation may fail in Docker/standalone modes.
 * This component extracts a frame from the video at 1 second using the HTML5 video
 * element and canvas API, providing a reliable client-side fallback.
 */
export function VideoThumbnail({ videoUrl, alt, className = "" }: VideoThumbnailProps) {
    const [thumbnail, setThumbnail] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(false)
    const videoRef = useRef<HTMLVideoElement | null>(null)

    useEffect(() => {
        const video = document.createElement("video")
        videoRef.current = video
        video.crossOrigin = "anonymous"
        video.muted = true
        video.preload = "metadata"

        video.onloadedmetadata = () => {
            // Seek to 1 second or 10% of duration, whichever is smaller
            const seekTime = Math.min(1, video.duration * 0.1)
            video.currentTime = seekTime
        }

        video.onseeked = () => {
            try {
                const canvas = document.createElement("canvas")
                canvas.width = video.videoWidth
                canvas.height = video.videoHeight
                const ctx = canvas.getContext("2d")
                if (ctx) {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
                    const dataUrl = canvas.toDataURL("image/jpeg", 0.8)
                    setThumbnail(dataUrl)
                }
            } catch (e) {
                // Canvas extraction can fail due to CORS or other issues
                setError(true)
            } finally {
                setIsLoading(false)
                // Clean up video element
                video.src = ""
                video.load()
            }
        }

        video.onerror = () => {
            setError(true)
            setIsLoading(false)
        }

        video.src = videoUrl

        return () => {
            // Cleanup on unmount
            video.src = ""
            video.load()
        }
    }, [videoUrl])

    if (error || (!isLoading && !thumbnail)) {
        // Fallback gradient with icon
        return (
            <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500 ${className}`}>
                <Film className="h-8 w-8 text-white/80" />
            </div>
        )
    }

    if (isLoading) {
        // Loading state with subtle animation
        return (
            <div className={`flex h-full w-full items-center justify-center bg-[var(--bg-tertiary)] ${className}`}>
                <div className="h-6 w-6 animate-pulse rounded-full bg-[var(--border)]" />
            </div>
        )
    }

    return (
        <img
            src={thumbnail!}
            alt={alt}
            className={`h-full w-full object-cover ${className}`}
        />
    )
}

/**
 * HoverVideoPreview Component
 *
 * Shows a static thumbnail by default and plays the video while hovered/focused.
 */
export function HoverVideoPreview({ videoUrl, posterUrl, alt, className = "" }: HoverVideoPreviewProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null)

    const play = () => {
        const video = videoRef.current
        if (!video) return
        video.currentTime = 0
        video.play().catch(() => {
            // Browser autoplay policies can still reject playback in edge cases.
        })
    }

    const pause = () => {
        const video = videoRef.current
        if (!video) return
        video.pause()
        video.currentTime = 0
    }

    return (
        <div
            className={`group/preview relative h-full w-full overflow-hidden ${className}`}
            onMouseEnter={play}
            onMouseLeave={pause}
            onFocus={play}
            onBlur={pause}
        >
            {posterUrl ? (
                <img
                    src={posterUrl}
                    alt={alt}
                    className="absolute inset-0 h-full w-full object-cover"
                />
            ) : (
                <VideoThumbnail videoUrl={videoUrl} alt={alt} />
            )}
            <video
                ref={videoRef}
                src={videoUrl}
                className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity group-hover/preview:opacity-100 group-focus-within/preview:opacity-100"
                muted
                playsInline
                preload="metadata"
                aria-label={alt}
            />
        </div>
    )
}
